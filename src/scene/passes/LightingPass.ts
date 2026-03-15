import { Context } from '../../renderer/Context';
import { GBufferPass } from './GBufferPass';
import { DirectionalLight } from '../DirectionalLight';
import { Camera } from '../Camera';
import { LIGHTING_SHADER } from '../../shaders/LightingShader';

/** Maximum directional lights supported in the WGSL shader. */
const MAX_LIGHTS = 8;

/**
 * LightingPass - Reads the G-Buffer and computes deferred Blinn-Phong lighting.
 * Renders a full-screen triangle, outputting the lit colour to the supplied
 * render target (or the swap-chain texture).
 */
export class LightingPass {
  private _context: Context;
  private _pipeline: GPURenderPipeline | null = null;
  private _cameraBindGroup: GPUBindGroup | null = null;
  private _gbufferBindGroup: GPUBindGroup | null = null;

  private _cameraUniformBuffer: GPUBuffer;
  private _lightingUniformBuffer: GPUBuffer;

  private _gbufferPass: GBufferPass;
  private _outputFormat: GPUTextureFormat;

  constructor(context: Context, gbufferPass: GBufferPass, outputFormat: GPUTextureFormat) {
    this._context      = context;
    this._gbufferPass  = gbufferPass;
    this._outputFormat = outputFormat;

    const device = context.device;

    // Camera UBO: 3×mat4 (192 bytes) + vec4 + vec2 + vec2 = 224 bytes → pad to 256
    this._cameraUniformBuffer = device.createBuffer({
      label: 'LightingPass.CameraUBO',
      size:  256,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Lighting UBO: MAX_LIGHTS × 48 bytes + 16 bytes header = 400 bytes → pad to 416
    const LIGHT_STRIDE = 48; // 3×vec4 = 48 bytes (direction + color + ambient + pad)
    this._lightingUniformBuffer = device.createBuffer({
      label: 'LightingPass.LightingUBO',
      size:  Math.ceil((MAX_LIGHTS * LIGHT_STRIDE + 16) / 16) * 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  /** Build or rebuild the render pipeline and bind groups. */
  prepare(): void {
    const device = this._context.device;
    const shader = device.createShaderModule({ code: LIGHTING_SHADER, label: 'LightingShader' });

    const bindGroupLayout0 = device.createBindGroupLayout({
      label: 'Lighting.BGL0',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    });

    const bindGroupLayout1 = device.createBindGroupLayout({
      label: 'Lighting.BGL1',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'non-filtering' } },
      ],
    });

    this._pipeline = device.createRenderPipeline({
      label:  'LightingPipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout0, bindGroupLayout1] }),
      vertex:   { module: shader, entryPoint: 'vs_main' },
      fragment: {
        module:  shader,
        entryPoint: 'fs_main',
        targets: [{ format: this._outputFormat }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
    });

    // Group 0: camera + lighting uniforms
    this._cameraBindGroup = device.createBindGroup({
      label:  'Lighting.BG0',
      layout: bindGroupLayout0,
      entries: [
        { binding: 0, resource: { buffer: this._cameraUniformBuffer } },
        { binding: 1, resource: { buffer: this._lightingUniformBuffer } },
      ],
    });

    // Group 1: G-Buffer textures
    const gb = this._gbufferPass.textures;
    this._gbufferBindGroup = device.createBindGroup({
      label:  'Lighting.BG1',
      layout: bindGroupLayout1,
      entries: [
        { binding: 0, resource: gb.albedoView },
        { binding: 1, resource: gb.normalView },
        { binding: 2, resource: gb.worldPosView },
        { binding: 3, resource: this._gbufferPass.sampler },
      ],
    });
  }

  /**
   * Update camera uniform buffer.
   */
  updateCamera(camera: Camera): void {
    const data = new Float32Array(64); // 256 bytes / 4
    const vp = camera.viewProjectionMatrix.values;
    const v  = camera.viewMatrix.values;
    const p  = camera.projectionMatrix.values;

    data.set(v,  0);   // viewMatrix     at offset 0
    data.set(p,  16);  // projMatrix     at offset 64
    data.set(vp, 32);  // viewProjMatrix at offset 128

    // cameraPosition at offset 192
    data[48] = camera.position.x;
    data[49] = camera.position.y;
    data[50] = camera.position.z;
    data[51] = 1.0;

    // viewportSize at offset 208
    data[52] = this._context.drawingBufferWidth;
    data[53] = this._context.drawingBufferHeight;

    // nearFar at offset 216
    data[54] = camera.frustum.near;
    data[55] = camera.frustum.far;

    this._context.writeBuffer(this._cameraUniformBuffer, 0, data);
  }

  /**
   * Update lighting uniform buffer.
   */
  updateLights(lights: DirectionalLight[]): void {
    const count = Math.min(lights.length, MAX_LIGHTS);
    const LIGHT_FLOATS = 12; // 48 bytes / 4
    const data = new Float32Array(MAX_LIGHTS * LIGHT_FLOATS + 4);

    for (let i = 0; i < count; i++) {
      const ld = lights[i].toFloat32Array();
      data.set(ld, i * LIGHT_FLOATS);
    }

    // lightCount (u32) at offset MAX_LIGHTS * LIGHT_FLOATS
    const countView = new Uint32Array(data.buffer, MAX_LIGHTS * LIGHT_FLOATS * 4, 4);
    countView[0] = count;

    this._context.writeBuffer(this._lightingUniformBuffer, 0, data);
  }

  /**
   * Rebuild G-Buffer bind group (call after GBuffer resize).
   */
  rebuildGBufferBindGroup(): void {
    if (!this._pipeline) return;
    const device = this._context.device;
    const layout = this._pipeline.getBindGroupLayout(1);
    const gb = this._gbufferPass.textures;
    this._gbufferBindGroup = device.createBindGroup({
      label:  'Lighting.BG1',
      layout,
      entries: [
        { binding: 0, resource: gb.albedoView },
        { binding: 1, resource: gb.normalView },
        { binding: 2, resource: gb.worldPosView },
        { binding: 3, resource: this._gbufferPass.sampler },
      ],
    });
  }

  /** Execute the lighting pass, drawing a full-screen triangle. */
  execute(encoder: GPUCommandEncoder, outputView: GPUTextureView): void {
    if (!this._pipeline || !this._cameraBindGroup || !this._gbufferBindGroup) {
      console.warn('LightingPass.execute: not prepared yet');
      return;
    }

    const pass = encoder.beginRenderPass({
      label: 'Lighting Pass',
      colorAttachments: [{
        view:       outputView,
        clearValue: { r: 0.0, g: 0.0, b: 0.05, a: 1.0 },
        loadOp:     'clear',
        storeOp:    'store',
      }],
    });

    pass.setPipeline(this._pipeline);
    pass.setBindGroup(0, this._cameraBindGroup);
    pass.setBindGroup(1, this._gbufferBindGroup);
    pass.draw(3); // full-screen triangle
    pass.end();
  }

  destroy(): void {
    this._cameraUniformBuffer.destroy();
    this._lightingUniformBuffer.destroy();
  }
}

export default LightingPass;
