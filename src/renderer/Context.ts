/**
 * Context - WebGPU device and adapter management.
 * Provides the core WebGPU resources required for rendering.
 */
export interface ContextOptions {
  powerPreference?: GPUPowerPreference;
  requiredFeatures?: GPUFeatureName[];
}

export class Context {
  private _adapter!: GPUAdapter;
  private _device!: GPUDevice;
  private _canvas: HTMLCanvasElement;
  private _context!: GPUCanvasContext;
  private _format!: GPUTextureFormat;
  private _initialized = false;

  constructor(canvas: HTMLCanvasElement) {
    this._canvas = canvas;
  }

  get adapter(): GPUAdapter { return this._adapter; }
  get device(): GPUDevice { return this._device; }
  get canvas(): HTMLCanvasElement { return this._canvas; }
  get gpuContext(): GPUCanvasContext { return this._context; }
  get preferredFormat(): GPUTextureFormat { return this._format; }
  get initialized(): boolean { return this._initialized; }

  get drawingBufferWidth(): number { return this._canvas.width; }
  get drawingBufferHeight(): number { return this._canvas.height; }

  /**
   * Initialize WebGPU adapter, device, and canvas context.
   * Throws if WebGPU is not supported.
   */
  async initialize(options: ContextOptions = {}): Promise<void> {
    if (!navigator.gpu) {
      throw new Error('WebGPU is not supported in this browser.');
    }

    this._adapter = await navigator.gpu.requestAdapter({
      powerPreference: options.powerPreference ?? 'high-performance',
    }) as GPUAdapter;

    if (!this._adapter) {
      throw new Error('Failed to obtain WebGPU adapter.');
    }

    const requiredFeatures: GPUFeatureName[] = options.requiredFeatures ?? [];
    // Request float32-filterable if available (needed for G-Buffer position texture)
    const availableFeatures = ['float32-filterable'] as GPUFeatureName[];
    for (const feat of availableFeatures) {
      if (this._adapter.features.has(feat)) {
        requiredFeatures.push(feat);
      }
    }

    this._device = await this._adapter.requestDevice({
      requiredFeatures,
    });

    this._device.lost.then((info) => {
      console.error(`WebGPU device lost: ${info.message}`);
    });

    this._context = this._canvas.getContext('webgpu') as GPUCanvasContext;
    if (!this._context) {
      throw new Error('Failed to obtain WebGPU canvas context.');
    }

    this._format = navigator.gpu.getPreferredCanvasFormat();
    this._context.configure({
      device: this._device,
      format: this._format,
      alphaMode: 'opaque',
    });

    this._initialized = true;
  }

  /**
   * Create a GPU buffer with given usage and optional initial data.
   */
  createBuffer(descriptor: GPUBufferDescriptor): GPUBuffer {
    return this._device.createBuffer(descriptor);
  }

  /**
   * Write data to a GPU buffer.
   */
  writeBuffer(buffer: GPUBuffer, offset: number, data: BufferSource): void {
    this._device.queue.writeBuffer(buffer, offset, data);
  }

  /**
   * Create a GPU texture.
   */
  createTexture(descriptor: GPUTextureDescriptor): GPUTexture {
    return this._device.createTexture(descriptor);
  }

  /**
   * Create a sampler.
   */
  createSampler(descriptor: GPUSamplerDescriptor = {}): GPUSampler {
    return this._device.createSampler(descriptor);
  }

  /**
   * Create a shader module from WGSL source.
   */
  createShaderModule(code: string, label?: string): GPUShaderModule {
    return this._device.createShaderModule({ code, label });
  }

  /**
   * Get the current swap chain texture view for rendering to screen.
   */
  getCurrentTextureView(): GPUTextureView {
    return this._context.getCurrentTexture().createView();
  }

  /**
   * Submit command buffers.
   */
  submit(commandBuffers: GPUCommandBuffer[]): void {
    this._device.queue.submit(commandBuffers);
  }

  /**
   * Resize canvas and update WebGPU context.
   */
  resize(width: number, height: number): void {
    this._canvas.width = width;
    this._canvas.height = height;
  }

  destroy(): void {
    this._device?.destroy();
  }
}

export default Context;
