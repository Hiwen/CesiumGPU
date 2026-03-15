import { Context } from '../renderer/Context';
import { Scene } from './Scene';
import { Primitive } from './Primitive';
import { Matrix4 } from '../math/Matrix4';
import { Color } from '../math/Color';
import { GltfLoader, ParsedMeshPrimitive } from '../loader/GltfLoader';

// ── Options ───────────────────────────────────────────────────────────────────

export interface ModelFromGltfOptions {
  /** URL of the GLTF or GLB file (absolute or relative). */
  url: string;
  /**
   * The scene in which the model will be rendered.
   * Needed to access the WebGPU context and register primitives.
   */
  scene: Scene;
  /**
   * World-space transform matrix applied to the whole model.
   * Defaults to the identity matrix.
   *
   * In CesiumGPU, world space is normalised ECEF (Earth radius = 1.0).
   * For correct on-Earth orientation, build the matrix using
   * `Transforms.eastNorthUpToFixedFrame(ecefPosition)` combined with a
   * GLTF Y-up correction (`Matrix4.fromRotationX(Math.PI / 2)`):
   *
   * ```typescript
   * import { Cartesian3, Transforms, Matrix4 } from './index';
   * const ecef   = Cartesian3.fromDegrees(lon, lat, alt); // metres
   * const enu    = Transforms.eastNorthUpToFixedFrame(ecef);
   * const yUpFix = Matrix4.fromRotationX(Math.PI / 2);
   * const mm     = Matrix4.multiply(enu, yUpFix, new Matrix4());
   * ```
   */
  modelMatrix?: Matrix4;
  /**
   * Uniform scale applied on top of `modelMatrix`.
   * Useful for quick size adjustments without recomputing the full matrix.
   */
  scale?: number;
  /** Whether the model is initially visible. Defaults to `true`. */
  show?: boolean;
}

// ── Model ─────────────────────────────────────────────────────────────────────

/**
 * Model – Represents a GLTF 2.0 / GLB model loaded for WebGPU rendering.
 *
 * Matches the Cesium `Model` API where relevant.
 *
 * ## Basic usage
 * ```typescript
 * import { Model, Matrix4, Cartesian3 } from './index';
 * import { Camera } from './scene/Camera';
 *
 * const scale = 100 / Camera.EARTH_SCALE;   // 100 m model in normalised ECEF
 * const pos   = Cartesian3.fromDegrees(116.4, 39.9, 200); // ECEF metres
 *
 * const model = await Model.fromGltfAsync({
 *   url:         '/models/drone.glb',
 *   scene:       viewer.scene,
 *   modelMatrix: Matrix4.fromTranslation(
 *     new Cartesian3(pos.x / Camera.EARTH_SCALE,
 *                    pos.y / Camera.EARTH_SCALE,
 *                    pos.z / Camera.EARTH_SCALE)
 *   ),
 *   scale: scale,
 * });
 * ```
 */
export class Model {
  // ── Public properties (Cesium-compatible) ──────────────────────────────────

  /** Show or hide the whole model. */
  show: boolean;

  /**
   * The model's world-space transform matrix (normalised ECEF).
   * After construction, modifying this property does **not** automatically
   * update the sub-primitive matrices — call `applyModelMatrix()` explicitly.
   */
  modelMatrix: Matrix4;

  /**
   * Resolves with this model instance once all GPU resources have been
   * created and the model is ready to render.
   */
  readonly readyPromise: Promise<Model>;

  // ── Private state ──────────────────────────────────────────────────────────

  /** GPU textures created for this model's materials (must be destroyed with the model). */
  private _textures: GPUTexture[] = [];

  /** The sub-primitives derived from GLTF mesh primitives. */
  private _primitives: Primitive[] = [];

  /**
   * Per-primitive GLTF-internal node matrices (column-major, float32).
   * Used to recompute primitive world matrices when `modelMatrix` changes.
   */
  private _nodeMatrices: Float32Array[] = [];

  private _scene: Scene;
  private _context: Context;
  private _isReady = false;
  private _scale: number;

  // ── Constructor (private – use fromGltfAsync) ──────────────────────────────

  private constructor(
    scene: Scene,
    context: Context,
    show: boolean,
    modelMatrix: Matrix4,
    scale: number
  ) {
    this._scene      = scene;
    this._context    = context;
    this.show        = show;
    this.modelMatrix = modelMatrix;
    this._scale      = scale;

    // Placeholder – overwritten inside fromGltfAsync
    this.readyPromise = Promise.resolve(this);
  }

  // ── Public factory ─────────────────────────────────────────────────────────

  /**
   * Load a GLTF or GLB model and create all required GPU resources.
   *
   * @param options - See `ModelFromGltfOptions`.
   * @returns A `Promise` that resolves with the fully loaded `Model`.
   */
  static async fromGltfAsync(options: ModelFromGltfOptions): Promise<Model> {
    const {
      url,
      scene,
      show        = true,
      scale       = 1.0,
      modelMatrix = Matrix4.identity(),
    } = options;

    // Access the private _context field via the scene (consistent with existing code style)
    const context = (scene as unknown as { _context: Context })._context;

    const model = new Model(scene, context, show, modelMatrix, scale);

    // Actually assign the real ready promise after construction
    (model as { readyPromise: Promise<Model> }).readyPromise =
      model._load(url).then(() => {
        model._isReady = true;
        return model;
      });

    return (model as { readyPromise: Promise<Model> }).readyPromise;
  }

  // ── Accessors ──────────────────────────────────────────────────────────────

  /** `true` once all GPU resources are uploaded and the model can be rendered. */
  get isReady(): boolean { return this._isReady; }

  /** Number of GLTF mesh primitives making up this model. */
  get primitiveCount(): number { return this._primitives.length; }

  // ── Public methods ─────────────────────────────────────────────────────────

  /**
   * Recompute all sub-primitive world matrices from the current `modelMatrix`.
   * Call this after modifying `modelMatrix` directly.
   */
  applyModelMatrix(): void {
    for (let i = 0; i < this._primitives.length; i++) {
      this._primitives[i].modelMatrix = this._combinedMatrix(this._nodeMatrices[i]);
    }
  }

  /**
   * Remove the model from the scene and release all GPU resources.
   */
  destroy(): void {
    for (const prim of this._primitives) {
      this._scene.primitives.remove(prim);
    }
    for (const tex of this._textures) {
      tex.destroy();
    }
    this._primitives  = [];
    this._nodeMatrices = [];
    this._textures    = [];
    this._isReady     = false;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /** Load the GLTF/GLB file and build all GPU primitives. */
  private async _load(url: string): Promise<void> {
    const parsed = await GltfLoader.load(url);
    for (const meshPrim of parsed.primitives) {
      this._createPrimitive(meshPrim);
    }
  }

  private _createPrimitive(meshPrim: ParsedMeshPrimitive): void {
    const mat  = meshPrim.material;
    const rgba = mat.baseColorFactor;

    const isTranslucent = mat.alphaMode === 'BLEND' || rgba[3] < 1.0;
    const color  = new Color(rgba[0], rgba[1], rgba[2], rgba[3]);

    const prim = new Primitive(this._context, {
      vertices:   meshPrim.vertices,
      indices:    meshPrim.indices,
      color,
      translucent: isTranslucent,
      alpha:       rgba[3],
    });

    // Apply the combined model × node matrix
    prim.modelMatrix = this._combinedMatrix(meshPrim.nodeMatrix);

    // Upload base-colour texture if available
    if (mat.baseColorTexture) {
      const bitmap  = mat.baseColorTexture;
      const texture = this._context.device.createTexture({
        label:  'Model.BaseColorTex',
        size:   { width: bitmap.width, height: bitmap.height },
        format: 'rgba8unorm',
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_DST        |
          GPUTextureUsage.RENDER_ATTACHMENT,
      });
      this._context.device.queue.copyExternalImageToTexture(
        { source: bitmap, flipY: false },
        { texture },
        { width: bitmap.width, height: bitmap.height }
      );
      prim.setTexture(texture);
      this._textures.push(texture);
    }

    // Register with the scene
    if (isTranslucent) {
      this._scene.addTransparentPrimitive(prim);
    } else {
      this._scene.addPrimitive(prim);
    }

    this._primitives.push(prim);
    this._nodeMatrices.push(meshPrim.nodeMatrix);
  }

  /**
   * Compute the combined world matrix for a single primitive:
   *   worldMatrix = modelMatrix × scale × nodeMatrix
   */
  private _combinedMatrix(nodeMatrix: Float32Array): Matrix4 {
    // Start from a mutable copy of the model matrix
    const result = this.modelMatrix.clone();
    const r      = result.values;

    // Apply uniform scale to the upper-left 3×3 of the model matrix
    if (this._scale !== 1.0) {
      const s = this._scale;
      r[0] *= s; r[1] *= s; r[2] *= s;
      r[4] *= s; r[5] *= s; r[6] *= s;
      r[8] *= s; r[9] *= s; r[10] *= s;
    }

    // Multiply result = result × nodeMatrix
    return Matrix4.multiply(result, Matrix4.fromArray(nodeMatrix), Matrix4.identity());
  }

}

export default Model;
