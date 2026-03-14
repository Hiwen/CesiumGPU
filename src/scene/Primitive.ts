import { Context } from '../renderer/Context';
import { Matrix4 } from '../math/Matrix4';
import { Cartesian3 } from '../math/Cartesian3';
import { Color } from '../math/Color';
import { GBUFFER_SHADER } from '../shaders/GBufferShader';

export interface PrimitiveOptions {
  /** Interleaved vertex buffer: [position(3), normal(3), uv(2)] per vertex */
  vertices: Float32Array;
  indices:  Uint32Array;
  /** World-space position (normalised ECEF, Earth radius = 1) */
  position?: Cartesian3;
  /** Uniform scale in world units */
  scale?: number;
  /** Base colour if no texture */
  color?: Color;
  /** Whether this primitive should be rendered as transparent */
  translucent?: boolean;
  /** Alpha for transparent primitives */
  alpha?: number;
}

/**
 * Primitive - A renderable mesh in the scene.
 * Matches Cesium's Primitive API (simplified).
 */
export class Primitive {
  show: boolean = true;
  modelMatrix: Matrix4;

  private _context: Context;
  private _vertexBuffer: GPUBuffer;
  private _indexBuffer: GPUBuffer;
  private _indexCount: number;
  private _translucent: boolean;

  private _modelUniformBuffer: GPUBuffer;
  private _materialUniformBuffer: GPUBuffer;
  private _opaqueModelBindGroup: GPUBindGroup | null = null;

  private _color: Color;
  private _alpha: number;

  // Base-colour texture (1×1 white if none supplied)
  private _texture:  GPUTexture;
  private _sampler:  GPUSampler;

  constructor(context: Context, options: PrimitiveOptions) {
    this._context    = context;
    this._translucent = options.translucent ?? false;
    this._color      = options.color ?? Color.WHITE;
    this._alpha      = options.alpha ?? 1.0;

    const device = context.device;

    // Vertex buffer
    this._vertexBuffer = device.createBuffer({
      label: 'Primitive.VBO',
      size:  options.vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    context.writeBuffer(this._vertexBuffer, 0, options.vertices.buffer as ArrayBuffer);

    // Index buffer
    this._indexBuffer = device.createBuffer({
      label: 'Primitive.IBO',
      size:  options.indices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    context.writeBuffer(this._indexBuffer, 0, options.indices.buffer as ArrayBuffer);
    this._indexCount = options.indices.length;

    // Model uniform buffer: modelMatrix (64 bytes) + normalMatrix (64 bytes) = 128 bytes
    this._modelUniformBuffer = device.createBuffer({
      label: 'Primitive.ModelUBO',
      size:  128,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Material uniform buffer: baseColor(16) + roughness(4) + metallic(4) + pad(8) = 32 bytes
    this._materialUniformBuffer = device.createBuffer({
      label: 'Primitive.MaterialUBO',
      size:  32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Model matrix
    this.modelMatrix = Matrix4.identity();
    if (options.position) {
      Matrix4.fromTranslation(options.position, this.modelMatrix);
    }
    if (options.scale !== undefined) {
      const s = options.scale;
      this.modelMatrix.values[0]  *= s;
      this.modelMatrix.values[5]  *= s;
      this.modelMatrix.values[10] *= s;
    }

    // 1×1 white texture (placeholder)
    this._texture = device.createTexture({
      label:  'Primitive.BaseColor',
      size:   { width: 1, height: 1 },
      format: 'rgba8unorm',
      usage:  GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    const white = new Uint8Array([
      Math.round(this._color.red   * 255),
      Math.round(this._color.green * 255),
      Math.round(this._color.blue  * 255),
      255,
    ]);
    device.queue.writeTexture(
      { texture: this._texture },
      white,
      { bytesPerRow: 4 },
      { width: 1, height: 1 }
    );

    this._sampler = context.createSampler({
      minFilter: 'linear',
      magFilter: 'linear',
      mipmapFilter: 'linear',
      addressModeU: 'repeat',
      addressModeV: 'repeat',
    });

    this._updateModelUBO();
    this._updateMaterialUBO();
  }

  get translucent(): boolean { return this._translucent; }

  set color(c: Color) {
    this._color = c;
    this._updateMaterialUBO();
  }

  set alpha(a: number) {
    this._alpha = a;
    this._updateMaterialUBO();
  }

  /**
   * Upload an earth texture image.
   */
  setTexture(texture: GPUTexture, sampler?: GPUSampler): void {
    this._texture = texture;
    if (sampler) this._sampler = sampler;
    // Invalidate bind groups
    this._opaqueModelBindGroup = null;
  }

  // ── G-Buffer (opaque) rendering ─────────────────────────────────────────────

  /**
   * Build the per-model bind group for the G-Buffer pass.
   */
  buildOpaqueBindGroup(pipeline: GPURenderPipeline): void {
    const device = this._context.device;
    this._opaqueModelBindGroup = device.createBindGroup({
      label:  'Primitive.OpaqueBG',
      layout: pipeline.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: { buffer: this._modelUniformBuffer } },
        { binding: 1, resource: this._texture.createView() },
        { binding: 2, resource: this._sampler },
      ],
    });
  }

  /**
   * Bind and draw this primitive in the G-Buffer pass.
   * @param pass         - active render pass encoder
   * @param cameraGroup  - bind group 0 (camera uniforms)
   */
  drawOpaque(pass: GPURenderPassEncoder, cameraGroup: GPUBindGroup): void {
    if (!this.show || this._translucent) return;
    if (!this._opaqueModelBindGroup) return;

    this._updateModelUBO();

    pass.setBindGroup(0, cameraGroup);
    pass.setBindGroup(1, this._opaqueModelBindGroup);
    pass.setVertexBuffer(0, this._vertexBuffer);
    pass.setIndexBuffer(this._indexBuffer, 'uint32');
    pass.drawIndexed(this._indexCount);
  }

  // ── Transparent rendering ──────────────────────────────────────────────────

  private _transparentModelBindGroup: GPUBindGroup | null = null;
  private _cameraBindGroup: GPUBindGroup | null = null;

  buildTransparentBindGroups(
    pipeline: GPURenderPipeline,
    cameraUBO: GPUBuffer,
    cameraBGL: GPUBindGroupLayout
  ): void {
    const device = this._context.device;

    this._cameraBindGroup = device.createBindGroup({
      label:  'Primitive.TranspCameraBG',
      layout: cameraBGL,
      entries: [{ binding: 0, resource: { buffer: cameraUBO } }],
    });

    this._transparentModelBindGroup = device.createBindGroup({
      label:  'Primitive.TranspModelBG',
      layout: pipeline.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: { buffer: this._modelUniformBuffer } },
        { binding: 1, resource: { buffer: this._materialUniformBuffer } },
      ],
    });
  }

  drawTransparent(pass: GPURenderPassEncoder): void {
    if (!this.show || !this._translucent) return;
    if (!this._transparentModelBindGroup || !this._cameraBindGroup) return;

    this._updateModelUBO();

    pass.setBindGroup(0, this._cameraBindGroup);
    pass.setBindGroup(1, this._transparentModelBindGroup);
    pass.setVertexBuffer(0, this._vertexBuffer);
    pass.setIndexBuffer(this._indexBuffer, 'uint32');
    pass.drawIndexed(this._indexCount);
  }

  destroy(): void {
    this._vertexBuffer.destroy();
    this._indexBuffer.destroy();
    this._modelUniformBuffer.destroy();
    this._materialUniformBuffer.destroy();
    this._texture.destroy();
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private _updateModelUBO(): void {
    const m = this.modelMatrix.values;

    // Compute the normal matrix = transpose(inverse(upper-left 3x3 of model))
    // For uniform-scaled objects, the normal matrix = model matrix (upper-left 3×3).
    const nm = new Float32Array(16);
    nm[0]  = m[0]; nm[1]  = m[1]; nm[2]  = m[2];  nm[3]  = 0;
    nm[4]  = m[4]; nm[5]  = m[5]; nm[6]  = m[6];  nm[7]  = 0;
    nm[8]  = m[8]; nm[9]  = m[9]; nm[10] = m[10]; nm[11] = 0;
    nm[12] = 0;    nm[13] = 0;    nm[14] = 0;      nm[15] = 1;

    const data = new Float32Array(32); // 128 bytes / 4
    data.set(m, 0);
    data.set(nm, 16);
    this._context.writeBuffer(this._modelUniformBuffer, 0, data);
  }

  private _updateMaterialUBO(): void {
    const data = new Float32Array(8); // 32 bytes / 4
    data[0] = this._color.red;
    data[1] = this._color.green;
    data[2] = this._color.blue;
    data[3] = this._alpha;
    data[4] = 0.5; // roughness
    data[5] = 0.0; // metallic
    this._context.writeBuffer(this._materialUniformBuffer, 0, data);
  }
}

/**
 * PrimitiveCollection - A collection of Primitive objects.
 * Matches Cesium's PrimitiveCollection API.
 */
export class PrimitiveCollection {
  private _primitives: Primitive[] = [];
  show: boolean = true;

  add(primitive: Primitive): Primitive {
    this._primitives.push(primitive);
    return primitive;
  }

  remove(primitive: Primitive): boolean {
    const idx = this._primitives.indexOf(primitive);
    if (idx === -1) return false;
    primitive.destroy();
    this._primitives.splice(idx, 1);
    return true;
  }

  contains(primitive: Primitive): boolean {
    return this._primitives.includes(primitive);
  }

  removeAll(): void {
    for (const p of this._primitives) p.destroy();
    this._primitives = [];
  }

  get length(): number { return this._primitives.length; }

  get(index: number): Primitive { return this._primitives[index]; }

  [Symbol.iterator](): Iterator<Primitive> {
    return this._primitives[Symbol.iterator]();
  }

  get opaque(): Primitive[] {
    return this._primitives.filter(p => p.show && !p.translucent);
  }

  get transparent(): Primitive[] {
    return this._primitives.filter(p => p.show && p.translucent);
  }
}

/**
 * Build a render pipeline for the G-Buffer pass.
 * Shared by all opaque Primitive objects.
 */
export function buildOpaquePipeline(context: Context, depthFormat: GPUTextureFormat): GPURenderPipeline {
  const device = context.device;
  const shader = device.createShaderModule({ code: GBUFFER_SHADER, label: 'GBufferShader' });

  const cameraBGL = device.createBindGroupLayout({
    label: 'GBuffer.BGL0',
    entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
  });

  const modelBGL = device.createBindGroupLayout({
    label: 'GBuffer.BGL1',
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
    ],
  });

  return device.createRenderPipeline({
    label:  'OpaquePipeline',
    layout: device.createPipelineLayout({ bindGroupLayouts: [cameraBGL, modelBGL] }),
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
      entryPoint: 'fs_main',
      targets: [
        { format: 'rgba8unorm'  }, // albedo
        { format: 'rgba16float' }, // normal
        { format: 'rgba32float' }, // worldPos
      ],
    },
    primitive:    { topology: 'triangle-list', cullMode: 'back' },
    depthStencil: { format: depthFormat, depthWriteEnabled: true, depthCompare: 'less' },
  });
}

export default Primitive;
