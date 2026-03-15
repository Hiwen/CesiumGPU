import { Cartesian3 } from './Cartesian3';

/**
 * Quaternion - Unit quaternion for representing 3D rotations, matching Cesium's Quaternion API.
 */
export class Quaternion {
  constructor(
    public x: number = 0.0,
    public y: number = 0.0,
    public z: number = 0.0,
    public w: number = 1.0
  ) {}

  static readonly ZERO = Object.freeze(new Quaternion(0, 0, 0, 0));
  static readonly IDENTITY = Object.freeze(new Quaternion(0, 0, 0, 1));

  clone(result?: Quaternion): Quaternion {
    if (!result) return new Quaternion(this.x, this.y, this.z, this.w);
    result.x = this.x;
    result.y = this.y;
    result.z = this.z;
    result.w = this.w;
    return result;
  }

  static fromAxisAngle(axis: Cartesian3, angle: number, result?: Quaternion): Quaternion {
    if (!result) result = new Quaternion();
    const halfAngle = angle * 0.5;
    const s = Math.sin(halfAngle);
    result.x = axis.x * s;
    result.y = axis.y * s;
    result.z = axis.z * s;
    result.w = Math.cos(halfAngle);
    return result;
  }

  static fromHeadingPitchRoll(
    heading: number,
    pitch: number,
    roll: number,
    result?: Quaternion
  ): Quaternion {
    if (!result) result = new Quaternion();
    const cosHalfH = Math.cos(heading * 0.5);
    const sinHalfH = Math.sin(heading * 0.5);
    const cosHalfP = Math.cos(pitch * 0.5);
    const sinHalfP = Math.sin(pitch * 0.5);
    const cosHalfR = Math.cos(roll * 0.5);
    const sinHalfR = Math.sin(roll * 0.5);

    result.x = sinHalfR * cosHalfP * cosHalfH - cosHalfR * sinHalfP * sinHalfH;
    result.y = cosHalfR * sinHalfP * cosHalfH + sinHalfR * cosHalfP * sinHalfH;
    result.z = cosHalfR * cosHalfP * sinHalfH - sinHalfR * sinHalfP * cosHalfH;
    result.w = cosHalfR * cosHalfP * cosHalfH + sinHalfR * sinHalfP * sinHalfH;
    return result;
  }

  static multiply(left: Quaternion, right: Quaternion, result: Quaternion): Quaternion {
    result.x = left.w * right.x + left.x * right.w + left.y * right.z - left.z * right.y;
    result.y = left.w * right.y - left.x * right.z + left.y * right.w + left.z * right.x;
    result.z = left.w * right.z + left.x * right.y - left.y * right.x + left.z * right.w;
    result.w = left.w * right.w - left.x * right.x - left.y * right.y - left.z * right.z;
    return result;
  }

  static normalize(quaternion: Quaternion, result: Quaternion): Quaternion {
    const mag = Math.sqrt(
      quaternion.x * quaternion.x +
        quaternion.y * quaternion.y +
        quaternion.z * quaternion.z +
        quaternion.w * quaternion.w
    );
    result.x = quaternion.x / mag;
    result.y = quaternion.y / mag;
    result.z = quaternion.z / mag;
    result.w = quaternion.w / mag;
    return result;
  }

  static conjugate(quaternion: Quaternion, result: Quaternion): Quaternion {
    result.x = -quaternion.x;
    result.y = -quaternion.y;
    result.z = -quaternion.z;
    result.w = quaternion.w;
    return result;
  }

  static slerp(start: Quaternion, end: Quaternion, t: number, result: Quaternion): Quaternion {
    let dot = start.x * end.x + start.y * end.y + start.z * end.z + start.w * end.w;
    let ex = end.x, ey = end.y, ez = end.z, ew = end.w;
    if (dot < 0) { dot = -dot; ex = -ex; ey = -ey; ez = -ez; ew = -ew; }

    let scale0: number, scale1: number;
    if (1 - dot > 0.0001) {
      const omega = Math.acos(dot);
      const sinOmega = Math.sin(omega);
      scale0 = Math.sin((1 - t) * omega) / sinOmega;
      scale1 = Math.sin(t * omega) / sinOmega;
    } else {
      scale0 = 1 - t;
      scale1 = t;
    }

    result.x = scale0 * start.x + scale1 * ex;
    result.y = scale0 * start.y + scale1 * ey;
    result.z = scale0 * start.z + scale1 * ez;
    result.w = scale0 * start.w + scale1 * ew;
    return result;
  }
}

export default Quaternion;
