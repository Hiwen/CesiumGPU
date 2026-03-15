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

  /** Minimum dot product of camera direction with nadir before pitch is rejected (~85° max tilt). */
  private static readonly _MAX_TILT_NADIR_DOT = Math.cos(CesiumMath.toRadians(85));

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

    // Unit vector of the current camera position (before the orbit step)
    const oldUnit = new Cartesian3();
    Cartesian3.normalize(this.position, oldUnit);

    // Current lon/lat
    const lon = Math.atan2(this.position.y, this.position.x);
    const lat = Math.asin(CesiumMath.clamp(this.position.z / radius, -1, 1));

    const newLon = lon + deltaLon;
    const newLat = CesiumMath.clamp(lat + deltaLat, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);

    this.position.x = radius * Math.cos(newLat) * Math.cos(newLon);
    this.position.y = radius * Math.cos(newLat) * Math.sin(newLon);
    this.position.z = radius * Math.sin(newLat);

    // Rotate the camera frame by the same rotation that maps oldUnit → newUnit
    // so that any pitch / heading applied via middle-mouse is preserved.
    const newUnit = new Cartesian3();
    Cartesian3.normalize(this.position, newUnit);
    const rotAxis = new Cartesian3();
    Cartesian3.cross(oldUnit, newUnit, rotAxis);
    const axisLen = Cartesian3.magnitude(rotAxis);
    if (axisLen > 1e-9) {
      Cartesian3.normalize(rotAxis, rotAxis);
      const angle = Math.acos(CesiumMath.clamp(Cartesian3.dot(oldUnit, newUnit), -1, 1));
      Camera._rotateByAxis(this.direction, rotAxis, angle, this.direction);
      Camera._rotateByAxis(this.up,        rotAxis, angle, this.up);
      Camera._rotateByAxis(this.right,     rotAxis, angle, this.right);
    }

    this._viewDirty = true;
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
   * Cast a ray from the camera through the given normalised device coordinates
   * and return the first intersection with the unit sphere (the Earth).
   * @param ndcX - normalised device X in [-1, 1] (right is positive)
   * @param ndcY - normalised device Y in [-1, 1] (up is positive)
   * @returns World-space intersection point, or null if the ray misses the globe.
   */
  pickGlobe(ndcX: number, ndcY: number): Cartesian3 | null {
    const tanHalfFovY = Math.tan(this.frustum.fov * 0.5);
    const tanHalfFovX = tanHalfFovY * this.frustum.aspectRatio;

    // World-space ray direction through the clicked pixel
    const rayDir = new Cartesian3(
      this.direction.x + ndcX * tanHalfFovX * this.right.x + ndcY * tanHalfFovY * this.up.x,
      this.direction.y + ndcX * tanHalfFovX * this.right.y + ndcY * tanHalfFovY * this.up.y,
      this.direction.z + ndcX * tanHalfFovX * this.right.z + ndcY * tanHalfFovY * this.up.z,
    );
    Cartesian3.normalize(rayDir, rayDir);

    // Ray-sphere intersection: |origin + t*dir|² = 1  (Earth radius = 1)
    // → t² + 2(origin·dir)t + (|origin|² − 1) = 0
    const b = 2.0 * Cartesian3.dot(this.position, rayDir);
    const c = Cartesian3.magnitudeSquared(this.position) - 1.0;
    const discriminant = b * b - 4.0 * c;
    if (discriminant < 0) return null;

    const t = (-b - Math.sqrt(discriminant)) * 0.5;
    if (t < 0) return null;

    return new Cartesian3(
      this.position.x + t * rayDir.x,
      this.position.y + t * rayDir.y,
      this.position.z + t * rayDir.z,
    );
  }

  /**
   * Orbit the camera around a pivot point on the Earth's surface.
   * Horizontal delta rotates around the outward surface normal at the pivot
   * (heading); vertical delta tilts the camera toward/away from the horizon
   * (pitch).  Both axes pass through the pivot point so it stays fixed on
   * screen.
   * @param pivot        - 3D pivot in normalised ECEF (Earth radius = 1)
   * @param deltaHeading - heading rotation in radians (positive = rightward)
   * @param deltaPitch   - pitch rotation in radians (positive = tilt down)
   */
  orbitAroundPivot(pivot: Cartesian3, deltaHeading: number, deltaPitch: number): void {
    // Arm vector: from pivot to camera position
    const arm = new Cartesian3(
      this.position.x - pivot.x,
      this.position.y - pivot.y,
      this.position.z - pivot.z,
    );

    // ── Step 1: Heading — rotate arm and the full camera frame around the
    //   pivot's outward surface normal.  This spins the camera around the
    //   globe point while keeping the camera's orientation relative to the
    //   surface intact.
    const pivotNormal = new Cartesian3();
    Cartesian3.normalize(pivot, pivotNormal);
    Camera._rotateByAxis(arm,            pivotNormal, deltaHeading, arm);
    Camera._rotateByAxis(this.direction, pivotNormal, deltaHeading, this.direction);
    Camera._rotateByAxis(this.up,        pivotNormal, deltaHeading, this.up);
    Camera._rotateByAxis(this.right,     pivotNormal, deltaHeading, this.right);

    // ── Step 2: Pitch — rotate arm, direction and up around the camera's
    //   (already-updated) right axis.  right is the rotation axis so it does
    //   not change.  Save state first so we can cancel an over-rotation.
    const armX = arm.x, armY = arm.y, armZ = arm.z;
    const dirX = this.direction.x, dirY = this.direction.y, dirZ = this.direction.z;
    const upX  = this.up.x,        upY  = this.up.y,        upZ  = this.up.z;

    Camera._rotateByAxis(arm,            this.right, deltaPitch, arm);
    Camera._rotateByAxis(this.direction, this.right, deltaPitch, this.direction);
    Camera._rotateByAxis(this.up,        this.right, deltaPitch, this.up);

    // Reject the pitch if it would tip the camera past ~85° from nadir
    // (dot product with nadir direction < cos(85°) ≈ 0.087).
    const newPos = new Cartesian3(pivot.x + arm.x, pivot.y + arm.y, pivot.z + arm.z);
    const newNadir = new Cartesian3(-newPos.x, -newPos.y, -newPos.z);
    Cartesian3.normalize(newNadir, newNadir);
    if (Cartesian3.dot(this.direction, newNadir) < Camera._MAX_TILT_NADIR_DOT) {
      arm.x = armX; arm.y = armY; arm.z = armZ;
      this.direction.x = dirX; this.direction.y = dirY; this.direction.z = dirZ;
      this.up.x = upX;         this.up.y = upY;         this.up.z = upZ;
    }

    // ── Apply new position ────────────────────────────────────────────────────
    this.position.x = pivot.x + arm.x;
    this.position.y = pivot.y + arm.y;
    this.position.z = pivot.z + arm.z;

    // Clamp to minimum altitude (1.05 = Earth radius + 5 % safety margin above surface)
    const r = Cartesian3.magnitude(this.position);
    if (r < 1.05) {
      const scale = 1.05 / r;
      this.position.x *= scale;
      this.position.y *= scale;
      this.position.z *= scale;
    }

    this._viewDirty = true;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Rotate vector v around unit axis by angle using Rodrigues' formula.
   * result may alias v.
   */
  private static _rotateByAxis(
    v: Cartesian3, axis: Cartesian3, angle: number, result: Cartesian3,
  ): Cartesian3 {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const dot = Cartesian3.dot(axis, v);
    const cross = new Cartesian3();
    Cartesian3.cross(axis, v, cross);
    // Compute into temporaries so result can safely alias v
    const rx = v.x * c + cross.x * s + axis.x * dot * (1 - c);
    const ry = v.y * c + cross.y * s + axis.y * dot * (1 - c);
    const rz = v.z * c + cross.z * s + axis.z * dot * (1 - c);
    result.x = rx; result.y = ry; result.z = rz;
    return result;
  }

  /**
   * Rebuild the camera's direction/right/up vectors so the camera looks
   * toward the Earth centre (nadir) from its current position.
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

    // Camera looks toward Earth centre
    this.direction.x = nadir.x;
    this.direction.y = nadir.y;
    this.direction.z = nadir.z;

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
