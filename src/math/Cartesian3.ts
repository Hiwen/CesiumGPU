import { CesiumMath } from './CesiumMath';

/**
 * Cartesian3 - 3D Cartesian coordinates, matching Cesium's Cartesian3 API.
 * Internal units: Earth equatorial radius = 1.0
 */
export class Cartesian3 {
  constructor(
    public x: number = 0.0,
    public y: number = 0.0,
    public z: number = 0.0
  ) {}

  static readonly ZERO = Object.freeze(new Cartesian3(0, 0, 0));
  static readonly ONE = Object.freeze(new Cartesian3(1, 1, 1));
  static readonly UNIT_X = Object.freeze(new Cartesian3(1, 0, 0));
  static readonly UNIT_Y = Object.freeze(new Cartesian3(0, 1, 0));
  static readonly UNIT_Z = Object.freeze(new Cartesian3(0, 0, 1));

  /** Earth's equatorial radius in meters (WGS84) */
  static readonly EARTH_RADIUS = 6378137.0;

  clone(result?: Cartesian3): Cartesian3 {
    if (!result) return new Cartesian3(this.x, this.y, this.z);
    result.x = this.x;
    result.y = this.y;
    result.z = this.z;
    return result;
  }

  equals(right?: Cartesian3): boolean {
    return (
      this === right ||
      (!!right && this.x === right.x && this.y === right.y && this.z === right.z)
    );
  }

  toString(): string {
    return `(${this.x}, ${this.y}, ${this.z})`;
  }

  /**
   * Convert from geographic coordinates (WGS84) to Cartesian3.
   * Returns position in meters (ECEF).
   * @param longitude - degrees
   * @param latitude - degrees
   * @param height - meters above WGS84 ellipsoid
   */
  static fromDegrees(
    longitude: number,
    latitude: number,
    height: number = 0.0,
    result?: Cartesian3
  ): Cartesian3 {
    return Cartesian3.fromRadians(
      CesiumMath.toRadians(longitude),
      CesiumMath.toRadians(latitude),
      height,
      result
    );
  }

  /**
   * Convert from geographic coordinates (radians) to Cartesian3 ECEF (meters).
   */
  static fromRadians(
    longitude: number,
    latitude: number,
    height: number = 0.0,
    result?: Cartesian3
  ): Cartesian3 {
    // WGS84 parameters
    const a = 6378137.0; // semi-major axis (m)
    const b = 6356752.3142; // semi-minor axis (m)
    const e2 = 1.0 - (b * b) / (a * a);

    const cosLat = Math.cos(latitude);
    const sinLat = Math.sin(latitude);
    const cosLon = Math.cos(longitude);
    const sinLon = Math.sin(longitude);

    const N = a / Math.sqrt(1.0 - e2 * sinLat * sinLat);

    const x = (N + height) * cosLat * cosLon;
    const y = (N + height) * cosLat * sinLon;
    const z = (N * (1.0 - e2) + height) * sinLat;

    if (!result) return new Cartesian3(x, y, z);
    result.x = x;
    result.y = y;
    result.z = z;
    return result;
  }

  static fromArray(array: number[], offset: number = 0, result?: Cartesian3): Cartesian3 {
    if (!result) result = new Cartesian3();
    result.x = array[offset];
    result.y = array[offset + 1];
    result.z = array[offset + 2];
    return result;
  }

  static clone(cartesian: Cartesian3, result?: Cartesian3): Cartesian3 {
    return cartesian.clone(result);
  }

  static add(left: Cartesian3, right: Cartesian3, result: Cartesian3): Cartesian3 {
    result.x = left.x + right.x;
    result.y = left.y + right.y;
    result.z = left.z + right.z;
    return result;
  }

  static subtract(left: Cartesian3, right: Cartesian3, result: Cartesian3): Cartesian3 {
    result.x = left.x - right.x;
    result.y = left.y - right.y;
    result.z = left.z - right.z;
    return result;
  }

  static multiplyByScalar(cartesian: Cartesian3, scalar: number, result: Cartesian3): Cartesian3 {
    result.x = cartesian.x * scalar;
    result.y = cartesian.y * scalar;
    result.z = cartesian.z * scalar;
    return result;
  }

  static multiplyComponents(left: Cartesian3, right: Cartesian3, result: Cartesian3): Cartesian3 {
    result.x = left.x * right.x;
    result.y = left.y * right.y;
    result.z = left.z * right.z;
    return result;
  }

  static dot(left: Cartesian3, right: Cartesian3): number {
    return left.x * right.x + left.y * right.y + left.z * right.z;
  }

  static cross(left: Cartesian3, right: Cartesian3, result: Cartesian3): Cartesian3 {
    result.x = left.y * right.z - left.z * right.y;
    result.y = left.z * right.x - left.x * right.z;
    result.z = left.x * right.y - left.y * right.x;
    return result;
  }

  static magnitude(cartesian: Cartesian3): number {
    return Math.sqrt(Cartesian3.magnitudeSquared(cartesian));
  }

  static magnitudeSquared(cartesian: Cartesian3): number {
    return cartesian.x * cartesian.x + cartesian.y * cartesian.y + cartesian.z * cartesian.z;
  }

  static normalize(cartesian: Cartesian3, result: Cartesian3): Cartesian3 {
    const mag = Cartesian3.magnitude(cartesian);
    result.x = cartesian.x / mag;
    result.y = cartesian.y / mag;
    result.z = cartesian.z / mag;
    return result;
  }

  static distance(left: Cartesian3, right: Cartesian3): number {
    const dx = left.x - right.x;
    const dy = left.y - right.y;
    const dz = left.z - right.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  static negate(cartesian: Cartesian3, result: Cartesian3): Cartesian3 {
    result.x = -cartesian.x;
    result.y = -cartesian.y;
    result.z = -cartesian.z;
    return result;
  }

  static lerp(start: Cartesian3, end: Cartesian3, t: number, result: Cartesian3): Cartesian3 {
    result.x = (1 - t) * start.x + t * end.x;
    result.y = (1 - t) * start.y + t * end.y;
    result.z = (1 - t) * start.z + t * end.z;
    return result;
  }

  static equals(left?: Cartesian3, right?: Cartesian3): boolean {
    return (
      left === right ||
      (!!left && !!right && left.x === right.x && left.y === right.y && left.z === right.z)
    );
  }

  static equalsEpsilon(
    left: Cartesian3,
    right: Cartesian3,
    relativeEpsilon: number = 0,
    absoluteEpsilon: number = relativeEpsilon
  ): boolean {
    return (
      left === right ||
      (CesiumMath.equalsEpsilon(left.x, right.x, relativeEpsilon, absoluteEpsilon) &&
        CesiumMath.equalsEpsilon(left.y, right.y, relativeEpsilon, absoluteEpsilon) &&
        CesiumMath.equalsEpsilon(left.z, right.z, relativeEpsilon, absoluteEpsilon))
    );
  }

  /** Convert to a Float32Array [x, y, z] */
  toArray(): number[] {
    return [this.x, this.y, this.z];
  }

  toFloat32Array(): Float32Array {
    return new Float32Array([this.x, this.y, this.z]);
  }
}

export default Cartesian3;
