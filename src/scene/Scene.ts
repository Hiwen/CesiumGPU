import { Context } from '../renderer/Context';
import { Camera } from './Camera';
import { Globe } from './Globe';
import { DirectionalLight } from './DirectionalLight';
import { GBufferPass } from './passes/GBufferPass';
import { LightingPass } from './passes/LightingPass';
import { TransparentPass } from './passes/TransparentPass';
import {
  Primitive,
  PrimitiveCollection,
  buildOpaquePipeline,
} from './Primitive';
import { GBUFFER_SHADER } from '../shaders/GBufferShader';

/**
 * Scene - Orchestrates all rendering passes.
 *
 * Rendering pipeline:
 *  1. G-Buffer pass  → writes albedo / normal / worldPos for all opaque prims
 *  2. Lighting pass  → reads G-Buffer, outputs lit opaque scene
 *  3. Transparent accumulation pass → WBOIT accumulate
 *  4. Transparent composite pass    → blend over opaque result
 */
export class Scene {
  readonly camera: Camera;
  readonly globe: Globe;
  readonly primitives: PrimitiveCollection;

  /** Directional lights in the scene (max 8). */
  readonly lights: DirectionalLight[] = [];

  private _context: Context;
  private _gbufferPass: GBufferPass;
  private _lightingPass: LightingPass;
  private _transparentPass: TransparentPass;

  private _opaquePipeline: GPURenderPipeline | null = null;
  private _cameraUniformBuffer: GPUBuffer;
  private _cameraBindGroup: GPUBindGroup | null = null;

  private _prepared = false;
  private _width:  number;
  private _height: number;

  constructor(context: Context) {
    this._context = context;
    this._width   = context.drawingBufferWidth;
    this._height  = context.drawingBufferHeight;

    this.camera     = new Camera();
    this.globe      = new Globe(context);
    this.primitives = new PrimitiveCollection();

    // Default sun light
    this.lights.push(new DirectionalLight({
      direction:        [0.5, -0.3, -0.8],
      color:            [1.0, 0.98, 0.9],
      intensity:        1.2,
      ambientIntensity: 0.08,
    }));

    // G-Buffer pass
    this._gbufferPass = new GBufferPass(context, this._width, this._height);

    // Lighting pass
    this._lightingPass = new LightingPass(
      context,
      this._gbufferPass,
      context.preferredFormat
    );

    // Transparent pass
    this._transparentPass = new TransparentPass(
      context,
      this._width,
      this._height,
      context.preferredFormat
    );

    // Shared camera UBO (G-Buffer pass)
    this._cameraUniformBuffer = context.device.createBuffer({
      label: 'Scene.CameraUBO',
      size:  256,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  /**
   * Initialise all render pipelines.  Must be called before the first render.
   */
  async initialize(): Promise<void> {
    if (this._prepared) return;

    // Build globe geometry
    const globePrimitive = this.globe.initialize();

    // Build opaque render pipeline (shared)
    this._opaquePipeline = buildOpaquePipeline(this._context, 'depth32float');

    // Build per-primitive bind groups
    globePrimitive.buildOpaqueBindGroup(this._opaquePipeline);

    // Camera bind group for G-Buffer pass
    this._cameraBindGroup = this._context.device.createBindGroup({
      label:  'Scene.CameraBG',
      layout: this._opaquePipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this._cameraUniformBuffer } }],
    });

    // Lighting pass
    this._lightingPass.prepare();

    // Transparent pass
    this._transparentPass.prepare();

    this._prepared = true;
  }

  /**
   * Add a transparent primitive to the scene.
   */
  addTransparentPrimitive(primitive: Primitive): void {
    if (!this._transparentPass.accumulationPipeline || !this._transparentPass.cameraBindGroupLayout) {
      console.warn('Scene.addTransparentPrimitive: scene not yet prepared');
      return;
    }
    primitive.buildTransparentBindGroups(
      this._transparentPass.accumulationPipeline,
      this._transparentPass.cameraUniformBuffer,
      this._transparentPass.cameraBindGroupLayout
    );
    this.primitives.add(primitive);
  }

  /**
   * Add an opaque primitive to the scene.
   */
  addPrimitive(primitive: Primitive): void {
    if (this._opaquePipeline) {
      primitive.buildOpaqueBindGroup(this._opaquePipeline);
    }
    this.primitives.add(primitive);
  }

  /**
   * Handle canvas resize.
   */
  resize(width: number, height: number): void {
    this._width  = width;
    this._height = height;
    this._context.resize(width, height);
    this._gbufferPass.resize(width, height);
    this._transparentPass.resize(width, height);
    this._lightingPass.rebuildGBufferBindGroup();
    this.camera.setAspectRatio(width / height);
  }

  /**
   * Render one frame.
   */
  render(): void {
    if (!this._prepared || !this._opaquePipeline || !this._cameraBindGroup) return;

    const ctx     = this._context;
    const device  = ctx.device;
    const encoder = device.createCommandEncoder({ label: 'Frame Encoder' });

    // ── Upload camera uniforms ─────────────────────────────────────────────
    this._uploadCameraUBO();
    this._lightingPass.updateCamera(this.camera);
    this._lightingPass.updateLights(this.lights);
    this._transparentPass.updateCamera(this.camera);

    // ── 1. G-Buffer pass (opaque geometry) ────────────────────────────────
    {
      const pass = this._gbufferPass.beginRenderPass(encoder);
      pass.setPipeline(this._opaquePipeline);

      // Globe
      const gp = this.globe.primitive;
      if (gp && this.globe.show) {
        gp.drawOpaque(pass, this._cameraBindGroup);
      }

      // Other opaque primitives
      for (const prim of this.primitives.opaque) {
        prim.drawOpaque(pass, this._cameraBindGroup);
      }

      pass.end();
    }

    // ── 2. Lighting pass (deferred shading, outputs to swap-chain) ────────
    const swapChainView = ctx.getCurrentTextureView();
    this._lightingPass.execute(encoder, swapChainView);

    // ── 3. Transparent accumulation pass ──────────────────────────────────
    const transparents = this.primitives.transparent;
    if (transparents.length > 0 && this._transparentPass.accumulationPipeline) {
      const depthView = this._gbufferPass.textures.depthView;
      const accumPass = this._transparentPass.beginAccumulationPass(encoder, depthView);
      accumPass.setPipeline(this._transparentPass.accumulationPipeline);

      for (const prim of transparents) {
        prim.drawTransparent(accumPass);
      }
      accumPass.end();

      // ── 4. Transparent composite pass ─────────────────────────────────
      this._transparentPass.executeComposite(encoder, swapChainView);
    }

    // ── Submit ────────────────────────────────────────────────────────────
    ctx.submit([encoder.finish()]);
  }

  destroy(): void {
    this.globe.destroy();
    this.primitives.removeAll();
    this._gbufferPass.destroy();
    this._lightingPass.destroy();
    this._transparentPass.destroy();
    this._cameraUniformBuffer.destroy();
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private _uploadCameraUBO(): void {
    const cam = this.camera;
    const data = new Float32Array(64); // 256 bytes / 4

    data.set(cam.viewMatrix.values,            0);   // viewMatrix (offset 0)
    data.set(cam.projectionMatrix.values,     16);   // projMatrix (offset 64)
    data.set(cam.viewProjectionMatrix.values, 32);   // viewProjMatrix (offset 128)
    data[48] = cam.position.x;                       // cameraPosition.x
    data[49] = cam.position.y;
    data[50] = cam.position.z;
    data[51] = 1.0;
    data[52] = this._width;                          // viewportSize
    data[53] = this._height;
    data[54] = cam.frustum.near;                     // nearFar
    data[55] = cam.frustum.far;

    this._context.writeBuffer(this._cameraUniformBuffer, 0, data);
  }
}

// Re-export for convenience
export { GBUFFER_SHADER };

export default Scene;
