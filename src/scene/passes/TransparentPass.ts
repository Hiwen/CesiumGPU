import { Context } from '../../renderer/Context';
import { Camera } from '../Camera';
import {
  TRANSPARENT_ACCUMULATION_SHADER,
  TRANSPARENT_COMPOSITE_SHADER,
} from '../../shaders/TransparentShader';

/**
 * TransparentPass - Weighted Blended Order-Independent Transparency (WBOIT).
 *
 * Two sub-passes:
 *  1. Accumulation: transparent objects write weighted colour+alpha into two
 *     render targets (accum + reveal).
 *  2. Composite: the accum/reveal textures are blended over the opaque scene.
 */
export class TransparentPass {
  private _context: Context;
  private _width: number;
  private _height: number;

  private _accumTexture:  GPUTexture | null = null;
  private _revealTexture: GPUTexture | null = null;
  private _accumView:  GPUTextureView | null = null;
  private _revealView: GPUTextureView | null = null;

  private _accumPipeline:     GPURenderPipeline | null = null;
  private _compositePipeline: GPURenderPipeline | null = null;

  private _compositeBindGroup: GPUBindGroup | null = null;
  private _nearestSampler: GPUSampler | null = null;

  // Shared camera UBO (written by Scene before each frame)
  readonly cameraUniformBuffer: GPUBuffer;
  private _cameraBindGroupLayout: GPUBindGroupLayout | null = null;

  private _outputFormat: GPUTextureFormat;
  private _depthFormat: GPUTextureFormat = 'depth32float';

  constructor(context: Context, width: number, height: number, outputFormat: GPUTextureFormat) {
    this._context      = context;
    this._width        = width;
    this._height       = height;
    this._outputFormat = outputFormat;

    this.cameraUniformBuffer = context.device.createBuffer({
      label: 'TransparentPass.CameraUBO',
      size:  256,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this._nearestSampler = context.createSampler({ minFilter: 'nearest', magFilter: 'nearest' });
  }

  prepare(): void {
    this._createRenderTargets();
    this._createAccumPipeline();
    this._createCompositePipeline();
  }

  resize(width: number, height: number): void {
    if (width === this._width && height === this._height) return;
    this._width  = width;
    this._height = height;
    this._destroyRenderTargets();
    this._createRenderTargets();
    this._rebuildCompositeBindGroup();
  }

  /**
   * Returns the accumulation render pipeline for use by transparent Primitive objects.
   */
  get accumulationPipeline(): GPURenderPipeline | null {
    return this._accumPipeline;
  }

  get cameraBindGroupLayout(): GPUBindGroupLayout | null {
    return this._cameraBindGroupLayout;
  }

  /**
   * Update the camera UBO (called once per frame by Scene).
   */
  updateCamera(camera: Camera): void {
    const data = new Float32Array(64);
    data.set(camera.viewMatrix.values,           0);
    data.set(camera.projectionMatrix.values,    16);
    data.set(camera.viewProjectionMatrix.values, 32);
    data[48] = camera.position.x;
    data[49] = camera.position.y;
    data[50] = camera.position.z;
    data[51] = 1.0;
    data[52] = this._context.drawingBufferWidth;
    data[53] = this._context.drawingBufferHeight;
    data[54] = camera.frustum.near;
    data[55] = camera.frustum.far;
    this._context.writeBuffer(this.cameraUniformBuffer, 0, data);
  }

  /**
   * Begin the accumulation render pass (clears accum/reveal targets).
   */
  beginAccumulationPass(encoder: GPUCommandEncoder, depthView: GPUTextureView): GPURenderPassEncoder {
    return encoder.beginRenderPass({
      label: 'Transparent Accumulation Pass',
      colorAttachments: [
        {
          view:       this._accumView!,
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp:  'clear',
          storeOp: 'store',
        },
        {
          view:       this._revealView!,
          clearValue: { r: 1, g: 0, b: 0, a: 0 }, // r8unorm: only the red channel is used; start at 1.0 (fully visible background)
          loadOp:  'clear',
          storeOp: 'store',
        },
      ],
      depthStencilAttachment: {
        view: depthView,
        depthReadOnly: true,
        // depthLoadOp / depthStoreOp must NOT be set when depthReadOnly is true (WebGPU spec)
      },
    });
  }

  /**
   * Execute the composite pass (blends transparent layer over opaque output).
   */
  executeComposite(encoder: GPUCommandEncoder, outputView: GPUTextureView): void {
    if (!this._compositePipeline || !this._compositeBindGroup) return;

    const pass = encoder.beginRenderPass({
      label: 'Transparent Composite Pass',
      colorAttachments: [{
        view:    outputView,
        loadOp:  'load',   // blend ON TOP of opaque result
        storeOp: 'store',
      }],
    });

    pass.setPipeline(this._compositePipeline);
    pass.setBindGroup(0, this._compositeBindGroup);
    pass.draw(3);
    pass.end();
  }

  destroy(): void {
    this.cameraUniformBuffer.destroy();
    this._destroyRenderTargets();
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private _createRenderTargets(): void {
    const device = this._context.device;
    const w = this._width, h = this._height;

    this._accumTexture = device.createTexture({
      label:  'Transparent.Accum',
      size:   { width: w, height: h },
      format: 'rgba16float',
      usage:  GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this._revealTexture = device.createTexture({
      label:  'Transparent.Reveal',
      size:   { width: w, height: h },
      format: 'r8unorm',
      usage:  GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this._accumView  = this._accumTexture.createView();
    this._revealView = this._revealTexture.createView();
  }

  private _destroyRenderTargets(): void {
    this._accumTexture?.destroy();
    this._revealTexture?.destroy();
    this._accumTexture  = null;
    this._revealTexture = null;
    this._accumView  = null;
    this._revealView = null;
  }

  private _createAccumPipeline(): void {
    const device = this._context.device;
    const shader = device.createShaderModule({ code: TRANSPARENT_ACCUMULATION_SHADER, label: 'TransparentAccumShader' });

    this._cameraBindGroupLayout = device.createBindGroupLayout({
      label: 'Transparent.BGL0',
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
    });

    const modelBGL = device.createBindGroupLayout({
      label: 'Transparent.BGL1',
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    });

    this._accumPipeline = device.createRenderPipeline({
      label:  'TransparentAccumPipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [this._cameraBindGroupLayout, modelBGL] }),
      vertex: {
        module:     shader,
        entryPoint: 'vs_main',
        buffers: [{
          arrayStride: 32, // 8 floats × 4 bytes
          attributes: [
            { shaderLocation: 0, offset: 0,  format: 'float32x3' }, // position
            { shaderLocation: 1, offset: 12, format: 'float32x3' }, // normal
            { shaderLocation: 2, offset: 24, format: 'float32x2' }, // uv
          ],
        }],
      },
      fragment: {
        module:     shader,
        entryPoint: 'fs_accum',
        targets: [
          // Accum: additive blending
          {
            format: 'rgba16float',
            blend: {
              color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
            },
          },
          // Reveal: multiplicative (product of (1-alpha))
          {
            format: 'r8unorm',
            blend: {
              color: { srcFactor: 'zero', dstFactor: 'one-minus-src', operation: 'add' },
              alpha: { srcFactor: 'zero', dstFactor: 'one-minus-src', operation: 'add' },
            },
            writeMask: GPUColorWrite.RED,
          },
        ],
      },
      primitive:    { topology: 'triangle-list', cullMode: 'back' },
      depthStencil: { format: this._depthFormat, depthWriteEnabled: false, depthCompare: 'less' },
    });
  }

  private _createCompositePipeline(): void {
    const device = this._context.device;
    const shader = device.createShaderModule({ code: TRANSPARENT_COMPOSITE_SHADER, label: 'TransparentCompositeShader' });

    const bgl = device.createBindGroupLayout({
      label: 'Composite.BGL',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'non-filtering' } },
      ],
    });

    this._compositePipeline = device.createRenderPipeline({
      label:  'TransparentCompositePipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [bgl] }),
      vertex:   { module: shader, entryPoint: 'vs_main' },
      fragment: {
        module:     shader,
        entryPoint: 'fs_composite',
        targets: [{
          format: this._outputFormat,
          blend: {
            // src = transparent colour; dst = opaque scene
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            alpha: { srcFactor: 'one',       dstFactor: 'one-minus-src-alpha', operation: 'add' },
          },
        }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
    });

    this._rebuildCompositeBindGroup();
  }

  private _rebuildCompositeBindGroup(): void {
    if (!this._compositePipeline || !this._accumView || !this._revealView) return;
    const device = this._context.device;
    this._compositeBindGroup = device.createBindGroup({
      label:  'Composite.BG',
      layout: this._compositePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this._accumView },
        { binding: 1, resource: this._revealView },
        { binding: 2, resource: this._nearestSampler! },
      ],
    });
  }
}

export default TransparentPass;
