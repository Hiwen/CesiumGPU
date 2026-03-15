import { Cartesian3 } from './Cartesian3';
import { Matrix4 } from './Matrix4';

/**
 * Transforms – Cesium-compatible coordinate-frame transforms.
 *
 * Provides utilities for converting between geographic and Cartesian
 * coordinate frames, mirroring Cesium's `Transforms` namespace.
 */
export class Transforms {
  /**
   * Compute the east-north-up (ENU) reference frame at the given WGS84 ECEF
   * position and return it as a 4×4 matrix that transforms from local ENU
   * space to normalised ECEF space (the coordinate system used by CesiumGPU,
   * where Earth radius ≈ 1.0).
   *
   * Equivalent to Cesium's `Transforms.eastNorthUpToFixedFrame(position)`.
   *
   * **Column layout of the returned matrix:**
   * | Column | Meaning                          |
   * |--------|----------------------------------|
   * | 0      | East  direction (unit vector)    |
   * | 1      | North direction (unit vector)    |
   * | 2      | Up    direction (surface normal) |
   * | 3      | `origin` in normalised ECEF      |
   *
   * ## Typical usage
   * ```typescript
   * import { Cartesian3, Transforms, Matrix4 } from './index';
   * import { Camera } from './scene/Camera';
   *
   * // Place a GLTF 2.0 model (Y-up) above Beijing at the Earth surface.
   * // GLTF is Y-up; ENU local frame is Z-up → apply a +90° rotation
   * // around the local East (X) axis so the model's +Y aligns with Up.
   * const ecef    = Cartesian3.fromDegrees(116.4, 39.9, 0); // metres
   * const enu     = Transforms.eastNorthUpToFixedFrame(ecef);
   * const yUpFix  = Matrix4.fromRotationX(Math.PI / 2);
   * const mm      = Matrix4.multiply(enu, yUpFix, new Matrix4());
   * const scale   = 500_000 / Camera.EARTH_SCALE; // 500 km visual size
   *
   * const model = await Model.fromGltfAsync({
   *   url: '/models/my-model.glb', scene: viewer.scene,
   *   modelMatrix: mm, scale,
   * });
   * ```
   *
   * @param origin - Position in ECEF **metres** (e.g. from `Cartesian3.fromDegrees`).
   * @param result - Optional pre-allocated output matrix.
   * @returns 4×4 ENU-to-normalised-ECEF matrix.
   */
  static eastNorthUpToFixedFrame(origin: Cartesian3, result?: Matrix4): Matrix4 {
    if (!result) result = new Matrix4();
    const v = result.values;

    // Derive geodetic longitude and latitude from the ECEF position vector.
    // (This is the spherical approximation, which is accurate enough for
    //  placing objects on the WGS84 surface.)
    const x = origin.x;
    const y = origin.y;
    const z = origin.z;

    const lon = Math.atan2(y, x);
    const p   = Math.sqrt(x * x + y * y);
    const lat = Math.atan2(z, p);

    const sinLon = Math.sin(lon);
    const cosLon = Math.cos(lon);
    const sinLat = Math.sin(lat);
    const cosLat = Math.cos(lat);

    // Unit basis vectors in ECEF:
    //   East  = (-sinLon,            cosLon,           0       )
    //   North = (-sinLat * cosLon,  -sinLat * sinLon,  cosLat  )
    //   Up    = ( cosLat * cosLon,   cosLat * sinLon,  sinLat  )

    const invS = 1.0 / Cartesian3.EARTH_RADIUS; // normalise to engine units

    // Column 0 – East
    v[0]  = -sinLon;
    v[1]  =  cosLon;
    v[2]  =  0.0;
    v[3]  =  0.0;

    // Column 1 – North
    v[4]  = -sinLat * cosLon;
    v[5]  = -sinLat * sinLon;
    v[6]  =  cosLat;
    v[7]  =  0.0;

    // Column 2 – Up (surface normal)
    v[8]  =  cosLat * cosLon;
    v[9]  =  cosLat * sinLon;
    v[10] =  sinLat;
    v[11] =  0.0;

    // Column 3 – Translation in normalised ECEF
    v[12] = x * invS;
    v[13] = y * invS;
    v[14] = z * invS;
    v[15] = 1.0;

    return result;
  }
}

export default Transforms;
