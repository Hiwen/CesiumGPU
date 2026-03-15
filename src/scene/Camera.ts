import { Matrix4 } from '../math/Matrix4';
import { Cartesian3 } from '../math/Cartesian3';
import { CesiumMath } from '../math/CesiumMath';

export interface SetViewOptions {
  destination?: Cartesian3;
  orientation?: {
    heading?: number;
    pitch?: number;
    roll?: number;
  };
}

/**
 * Camera - Perspective camera with orbit controls, matching Cesium's Camera API.
 *
 * Uses a right-handed coordinate system.  The Earth's centre is at the origin.
 * The camera's position is expressed in the same normalised ECEF space where the
 * Earth's equatorial radius ≈ 1.0 (scaled by EARTH_SCALE).
 */
export class Camera {
  /** Vertical field of view in radians. */
  frustum = {
    fov: CesiumMath.toRadians(60),
    aspectRatio: 1.0,
    near: 0.005,   // 0.5% of normalised Earth radius (≈32 km); safely below min camera-to-surface distance of 0.05
    far: 100.0,    // covers max orbit radius of 50 normalised units with generous margin
  };

  /** World-space position in normalised ECEF (Earth radius = 1). */
  position: Cartesian3;
  /** World-space direction the camera is looking. */
  direction: Cartesian3;
  /** World-space "up" vector. */
  up: Cartesian3;
  /** World-space "right" vector. */
  right: Cartesian3;

  private _viewMatrix: Matrix4;
  private _projMatrix: Matrix4;
  private _viewProjMatrix: Matrix4;
  private _viewDirty = true;
  private _projDirty = true;

  /** Pitch offset from nadir (radians). 0 = looking straight at Earth centre. */
  private _pitchOffset = 0;

  /** Scale factor: 1 internal unit = EARTH_SCALE metres */
  static readonly EARTH_SCALE = 6378137.0;

  constructor() {
    // Start above the equator at ~3× Earth radius
    this.position  = new Cartesian3(0, 0, 3.0);
    this.direction = new Cartesian3(0, 0, -1);
    this.up        = new Cartesian3(0, 1, 0);
    this.right     = new Cartesian3(1, 0, 0);

    this._viewMatrix     = new Matrix4();
    this._projMatrix     = new Matrix4();
    this._viewProjMatrix = new Matrix4();
  }

  // ── Matrix accessors ───────────────────────────────────────────────────────

  get viewMatrix(): Matrix4 {
    if (this._viewDirty) this._updateViewMatrix();
    return this._viewMatrix;
  }

  get projectionMatrix(): Matrix4 {
    if (this._projDirty) this._updateProjMatrix();
    return this._projMatrix;
  }

  get viewProjectionMatrix(): Matrix4 {
    if (this._viewDirty || this._projDirty) {
      if (this._viewDirty) this._updateViewMatrix();
      if (this._projDirty) this._updateProjMatrix();
      Matrix4.multiply(this._projMatrix, this._viewMatrix, this._viewProjMatrix);
    }
    return this._viewProjMatrix;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Position the camera using geographic coordinates.
   * @param destination - ECEF position (metres) or Cartesian3.fromDegrees result.
   */
  setView(options: SetViewOptions): void {
    if (options.destination) {
      // Convert from real ECEF (metres) to normalised units
      const scale = 1.0 / Camera.EARTH_SCALE;
      this.position.x = options.destination.x * scale;
      this.position.y = options.destination.y * scale;
      this.position.z = options.destination.z * scale;

      // Reset pitch to nadir view and rebuild the camera frame
      this._pitchOffset = 0;
      this._rebuildFrame();
    }
    this._viewDirty = true;
  }

  /**
   * Set aspect ratio (called when canvas is resized).
   */
  setAspectRatio(aspect: number): void {
    this.frustum.aspectRatio = aspect;
    this._projDirty = true;
  }

  /**
   * Orbit the camera around the Earth centre by delta angles (radians).
   */
  rotate(deltaLon: number, deltaLat: number): void {
    const radius = Cartesian3.magnitude(this.position);

    // Current lon/lat
    const lon = Math.atan2(this.position.y, this.position.x);
    const lat = Math.asin(CesiumMath.clamp(this.position.z / radius, -1, 1));

    const newLon = lon + deltaLon;
    const newLat = CesiumMath.clamp(lat + deltaLat, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);

    this.position.x = radius * Math.cos(newLat) * Math.cos(newLon);
    this.position.y = radius * Math.cos(newLat) * Math.sin(newLon);
    this.position.z = radius * Math.sin(newLat);

    // Rebuild the camera frame, preserving the current pitch offset
    this._rebuildFrame();
  }

  /**
   * Zoom the camera toward/away from Earth centre.
   * @param delta - negative = zoom in, positive = zoom out
   */
  zoom(delta: number): void {
    const minRadius = 1.05; // just above surface
    const maxRadius = 50.0;
    const radius = Cartesian3.magnitude(this.position);
    const newRadius = CesiumMath.clamp(radius + delta, minRadius, maxRadius);
    const scale = newRadius / radius;
    this.position.x *= scale;
    this.position.y *= scale;
    this.position.z *= scale;
    this._viewDirty = true;
  }

  /**
   * Fly to a position (immediate, no animation in this basic version).
   * @param destination - Cartesian3 in ECEF metres
   */
  flyTo(options: { destination: Cartesian3 }): void {
    this.setView({ destination: options.destination });
  }

  /**
   * Tilt the camera view by adjusting the pitch offset from nadir.
   * Positive delta tilts toward the horizon; negative tilts back toward nadir.
   * @param delta - angle change in radians
   */
  tilt(delta: number): void {
    // Clamp pitch offset: 0 = looking straight at Earth centre (nadir),
    // approaching PI/2 = looking at the horizon
    this._pitchOffset = CesiumMath.clamp(
      this._pitchOffset + delta,
      0,
      Math.PI / 2 - 0.05,
    );
    this._rebuildFrame();
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Rebuild the camera's direction/right/up vectors from the current position
   * and _pitchOffset.  Called after any change to position or pitch.
   */
  private _rebuildFrame(): void {
    // Nadir direction: from camera position toward Earth centre
    const nadir = new Cartesian3(
      -this.position.x, -this.position.y, -this.position.z,
    );
    Cartesian3.normalize(nadir, nadir);

    // Right vector: perpendicular to nadir and world-up (north pole)
    const worldUp = new Cartesian3(0, 0, 1);
    Cartesian3.cross(nadir, worldUp, this.right);
    if (Cartesian3.magnitude(this.right) < 1e-6) {
      // Degenerate at poles — fall back to a fixed right vector
      this.right.x = 1; this.right.y = 0; this.right.z = 0;
    } else {
      Cartesian3.normalize(this.right, this.right);
    }

    // "Orbit up" — perpendicular to both right and nadir, pointing toward
    // the horizon plane (i.e. cross(right, nadir) = up at zero pitch)
    const orbitUp = new Cartesian3();
    Cartesian3.cross(this.right, nadir, orbitUp);
    Cartesian3.normalize(orbitUp, orbitUp);

    // Apply pitch: rotate nadir toward orbitUp by _pitchOffset
    const c = Math.cos(this._pitchOffset);
    const s = Math.sin(this._pitchOffset);
    this.direction.x = nadir.x * c + orbitUp.x * s;
    this.direction.y = nadir.y * c + orbitUp.y * s;
    this.direction.z = nadir.z * c + orbitUp.z * s;

    // Camera up stays perpendicular to direction and right
    Cartesian3.cross(this.right, this.direction, this.up);
    Cartesian3.normalize(this.up, this.up);

    this._viewDirty = true;
  }

  private _updateViewMatrix(): void {
    const target = new Cartesian3(
      this.position.x + this.direction.x,
      this.position.y + this.direction.y,
      this.position.z + this.direction.z
    );
    Matrix4.lookAt(this.position, target, this.up, this._viewMatrix);
    this._viewDirty = false;
    // Invalidate combined matrix
    Matrix4.multiply(this._projMatrix, this._viewMatrix, this._viewProjMatrix);
  }

  private _updateProjMatrix(): void {
    Matrix4.perspective(
      this.frustum.fov,
      this.frustum.aspectRatio,
      this.frustum.near,
      this.frustum.far,
      this._projMatrix
    );
    this._projDirty = false;
    Matrix4.multiply(this._projMatrix, this._viewMatrix, this._viewProjMatrix);
  }
}

export default Camera;
