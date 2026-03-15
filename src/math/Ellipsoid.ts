import { Cartesian3 } from './Cartesian3';

/**
 * Ellipsoid - Represents an ellipsoid (such as WGS84 Earth), matching Cesium's Ellipsoid API.
 * Radii are in meters.
 */
export class Ellipsoid {
  readonly radii: Cartesian3;
  readonly radiiSquared: Cartesian3;
  readonly oneOverRadii: Cartesian3;
  readonly oneOverRadiiSquared: Cartesian3;

  constructor(x: number = 0, y: number = 0, z: number = 0) {
    this.radii = new Cartesian3(x, y, z);
    this.radiiSquared = new Cartesian3(x * x, y * y, z * z);
    this.oneOverRadii = new Cartesian3(
      x !== 0 ? 1.0 / x : 0,
      y !== 0 ? 1.0 / y : 0,
      z !== 0 ? 1.0 / z : 0
    );
    this.oneOverRadiiSquared = new Cartesian3(
      x !== 0 ? 1.0 / (x * x) : 0,
      y !== 0 ? 1.0 / (y * y) : 0,
      z !== 0 ? 1.0 / (z * z) : 0
    );
  }

  /** WGS84 Earth ellipsoid (semi-major axis = 6378137m, semi-minor = 6356752.3142m) */
  static readonly WGS84 = Object.freeze(
    new Ellipsoid(6378137.0, 6378137.0, 6356752.3142)
  );

  /** Unit sphere */
  static readonly UNIT_SPHERE = Object.freeze(new Ellipsoid(1.0, 1.0, 1.0));

  /**
   * Converts a Cartesian position on the ellipsoid surface to geographic coordinates.
   * @returns {longitude, latitude, height} in radians and meters
   */
  cartesianToCartographic(
    cartesian: Cartesian3,
    result?: { longitude: number; latitude: number; height: number }
  ): { longitude: number; latitude: number; height: number } {
    if (!result) result = { longitude: 0, latitude: 0, height: 0 };

    const p = new Cartesian3(
      cartesian.x * this.oneOverRadiiSquared.x,
      cartesian.y * this.oneOverRadiiSquared.y,
      cartesian.z * this.oneOverRadiiSquared.z
    );

    // Iterative solution (Bowring's method simplified)
    const lon = Math.atan2(cartesian.y, cartesian.x);
    const p2 = Math.sqrt(cartesian.x * cartesian.x + cartesian.y * cartesian.y);
    let lat = Math.atan2(cartesian.z, p2);

    const a = this.radii.x;
    const b = this.radii.z;
    const e2 = 1.0 - (b * b) / (a * a);

    for (let i = 0; i < 5; i++) {
      const sinLat = Math.sin(lat);
      const N = a / Math.sqrt(1 - e2 * sinLat * sinLat);
      lat = Math.atan2(cartesian.z + e2 * N * sinLat, p2);
    }

    const sinLat = Math.sin(lat);
    const N = a / Math.sqrt(1 - e2 * sinLat * sinLat);
    const height = p2 / Math.cos(lat) - N;

    result.longitude = lon;
    result.latitude = lat;
    result.height = height;

    // Suppress unused variable warning
    void p;
    return result;
  }

  /**
   * Computes the surface normal at a point on the ellipsoid.
   */
  geodeticSurfaceNormal(cartesian: Cartesian3, result?: Cartesian3): Cartesian3 {
    if (!result) result = new Cartesian3();
    result.x = cartesian.x * this.oneOverRadiiSquared.x;
    result.y = cartesian.y * this.oneOverRadiiSquared.y;
    result.z = cartesian.z * this.oneOverRadiiSquared.z;
    return Cartesian3.normalize(result, result);
  }

  /**
   * Projects a geographic position (radians) to a Cartesian3 on the ellipsoid surface.
   */
  cartographicToCartesian(
    longitude: number,
    latitude: number,
    height: number = 0,
    result?: Cartesian3
  ): Cartesian3 {
    if (!result) result = new Cartesian3();
    const cosLat = Math.cos(latitude);
    const sinLat = Math.sin(latitude);
    const cosLon = Math.cos(longitude);
    const sinLon = Math.sin(longitude);

    const a = this.radii.x;
    const b = this.radii.z;
    const e2 = 1.0 - (b * b) / (a * a);
    const N = a / Math.sqrt(1 - e2 * sinLat * sinLat);

    result.x = (N + height) * cosLat * cosLon;
    result.y = (N + height) * cosLat * sinLon;
    result.z = (N * (1 - e2) + height) * sinLat;

    return result;
  }
}

export default Ellipsoid;
