import { Cartesian3 } from './Cartesian3';

/**
 * Matrix4 - 4x4 matrix stored in column-major order, matching Cesium's Matrix4 API.
 * Elements are indexed as [column * 4 + row].
 */
export class Matrix4 {
  /**
   * 16-element array in column-major order.
   */
  readonly values: Float32Array;

  constructor(
    column0Row0: number = 0, column1Row0: number = 0, column2Row0: number = 0, column3Row0: number = 0,
    column0Row1: number = 0, column1Row1: number = 0, column2Row1: number = 0, column3Row1: number = 0,
    column0Row2: number = 0, column1Row2: number = 0, column2Row2: number = 0, column3Row2: number = 0,
    column0Row3: number = 0, column1Row3: number = 0, column2Row3: number = 0, column3Row3: number = 0
  ) {
    this.values = new Float32Array([
      column0Row0, column0Row1, column0Row2, column0Row3,
      column1Row0, column1Row1, column1Row2, column1Row3,
      column2Row0, column2Row1, column2Row2, column2Row3,
      column3Row0, column3Row1, column3Row2, column3Row3,
    ]);
  }

  static readonly IDENTITY = Object.freeze(
    new Matrix4(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)
  );

  static readonly ZERO = Object.freeze(new Matrix4());

  clone(result?: Matrix4): Matrix4 {
    if (!result) result = new Matrix4();
    result.values.set(this.values);
    return result;
  }

  /** Create from column-major Float32Array (WebGPU/WebGL format) */
  static fromArray(array: Float32Array | number[], result?: Matrix4): Matrix4 {
    if (!result) result = new Matrix4();
    for (let i = 0; i < 16; i++) result.values[i] = array[i];
    return result;
  }

  static identity(result?: Matrix4): Matrix4 {
    if (!result) result = new Matrix4();
    result.values.fill(0);
    result.values[0] = 1;
    result.values[5] = 1;
    result.values[10] = 1;
    result.values[15] = 1;
    return result;
  }

  static fromTranslation(translation: Cartesian3, result?: Matrix4): Matrix4 {
    if (!result) result = new Matrix4();
    result.values.fill(0);
    result.values[0] = 1;
    result.values[5] = 1;
    result.values[10] = 1;
    result.values[12] = translation.x;
    result.values[13] = translation.y;
    result.values[14] = translation.z;
    result.values[15] = 1;
    return result;
  }

  static fromScale(scale: Cartesian3, result?: Matrix4): Matrix4 {
    if (!result) result = new Matrix4();
    result.values.fill(0);
    result.values[0] = scale.x;
    result.values[5] = scale.y;
    result.values[10] = scale.z;
    result.values[15] = 1;
    return result;
  }

  static fromUniformScale(scale: number, result?: Matrix4): Matrix4 {
    return Matrix4.fromScale(new Cartesian3(scale, scale, scale), result);
  }

  static fromRotationX(angle: number, result?: Matrix4): Matrix4 {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    if (!result) result = new Matrix4();
    result.values.fill(0);
    result.values[0] = 1;
    result.values[5] = c; result.values[6] = s;
    result.values[9] = -s; result.values[10] = c;
    result.values[15] = 1;
    return result;
  }

  static fromRotationY(angle: number, result?: Matrix4): Matrix4 {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    if (!result) result = new Matrix4();
    result.values.fill(0);
    result.values[0] = c; result.values[2] = -s;
    result.values[5] = 1;
    result.values[8] = s; result.values[10] = c;
    result.values[15] = 1;
    return result;
  }

  static fromRotationZ(angle: number, result?: Matrix4): Matrix4 {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    if (!result) result = new Matrix4();
    result.values.fill(0);
    result.values[0] = c; result.values[1] = s;
    result.values[4] = -s; result.values[5] = c;
    result.values[10] = 1;
    result.values[15] = 1;
    return result;
  }

  /**
   * Creates a perspective projection matrix (right-handed, reversed-Z for better precision).
   * Matches Cesium convention.
   */
  static perspectiveFieldOfView(
    fovY: number,
    aspectRatio: number,
    near: number,
    far: number,
    result?: Matrix4
  ): Matrix4 {
    if (!result) result = new Matrix4();
    result.values.fill(0);
    const f = 1.0 / Math.tan(fovY * 0.5);
    result.values[0] = f / aspectRatio;
    result.values[5] = f;
    // Reversed-Z (NDC depth range [1,0] for better precision)
    result.values[10] = near / (near - far);
    result.values[11] = -1;
    result.values[14] = (far * near) / (near - far);
    return result;
  }

  /**
   * Creates a standard perspective projection (NDC depth [0,1]).
   */
  static perspective(
    fovY: number,
    aspectRatio: number,
    near: number,
    far: number,
    result?: Matrix4
  ): Matrix4 {
    if (!result) result = new Matrix4();
    result.values.fill(0);
    const f = 1.0 / Math.tan(fovY * 0.5);
    result.values[0] = f / aspectRatio;
    result.values[5] = f;
    result.values[10] = far / (near - far);
    result.values[11] = -1;
    result.values[14] = (far * near) / (near - far);
    return result;
  }

  /**
   * Creates a view matrix (right-hand look-at).
   */
  static lookAt(eye: Cartesian3, target: Cartesian3, up: Cartesian3, result?: Matrix4): Matrix4 {
    if (!result) result = new Matrix4();

    const fwd = new Cartesian3(
      target.x - eye.x,
      target.y - eye.y,
      target.z - eye.z
    );
    const fwdLen = Cartesian3.magnitude(fwd);
    fwd.x /= fwdLen; fwd.y /= fwdLen; fwd.z /= fwdLen;

    const right = new Cartesian3();
    Cartesian3.cross(fwd, up, right);
    const rightLen = Cartesian3.magnitude(right);
    right.x /= rightLen; right.y /= rightLen; right.z /= rightLen;

    const newUp = new Cartesian3();
    Cartesian3.cross(right, fwd, newUp);

    const v = result.values;
    v[0]  = right.x;  v[1]  = newUp.x;  v[2]  = -fwd.x; v[3]  = 0;
    v[4]  = right.y;  v[5]  = newUp.y;  v[6]  = -fwd.y; v[7]  = 0;
    v[8]  = right.z;  v[9]  = newUp.z;  v[10] = -fwd.z; v[11] = 0;
    v[12] = -Cartesian3.dot(right, eye);
    v[13] = -Cartesian3.dot(newUp, eye);
    v[14] = Cartesian3.dot(fwd, eye);
    v[15] = 1;

    return result;
  }

  static multiply(left: Matrix4, right: Matrix4, result: Matrix4): Matrix4 {
    const a = left.values;
    const b = right.values;
    const r = result.values;

    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

    const b00 = b[0], b01 = b[1], b02 = b[2], b03 = b[3];
    const b10 = b[4], b11 = b[5], b12 = b[6], b13 = b[7];
    const b20 = b[8], b21 = b[9], b22 = b[10], b23 = b[11];
    const b30 = b[12], b31 = b[13], b32 = b[14], b33 = b[15];

    r[0]  = a00*b00 + a10*b01 + a20*b02 + a30*b03;
    r[1]  = a01*b00 + a11*b01 + a21*b02 + a31*b03;
    r[2]  = a02*b00 + a12*b01 + a22*b02 + a32*b03;
    r[3]  = a03*b00 + a13*b01 + a23*b02 + a33*b03;
    r[4]  = a00*b10 + a10*b11 + a20*b12 + a30*b13;
    r[5]  = a01*b10 + a11*b11 + a21*b12 + a31*b13;
    r[6]  = a02*b10 + a12*b11 + a22*b12 + a32*b13;
    r[7]  = a03*b10 + a13*b11 + a23*b12 + a33*b13;
    r[8]  = a00*b20 + a10*b21 + a20*b22 + a30*b23;
    r[9]  = a01*b20 + a11*b21 + a21*b22 + a31*b23;
    r[10] = a02*b20 + a12*b21 + a22*b22 + a32*b23;
    r[11] = a03*b20 + a13*b21 + a23*b22 + a33*b23;
    r[12] = a00*b30 + a10*b31 + a20*b32 + a30*b33;
    r[13] = a01*b30 + a11*b31 + a21*b32 + a31*b33;
    r[14] = a02*b30 + a12*b31 + a22*b32 + a32*b33;
    r[15] = a03*b30 + a13*b31 + a23*b32 + a33*b33;

    return result;
  }

  static transpose(matrix: Matrix4, result: Matrix4): Matrix4 {
    const m = matrix.values;
    const r = result.values;
    r[0] = m[0]; r[1] = m[4]; r[2] = m[8]; r[3] = m[12];
    r[4] = m[1]; r[5] = m[5]; r[6] = m[9]; r[7] = m[13];
    r[8] = m[2]; r[9] = m[6]; r[10] = m[10]; r[11] = m[14];
    r[12] = m[3]; r[13] = m[7]; r[14] = m[11]; r[15] = m[15];
    return result;
  }

  static inverse(matrix: Matrix4, result: Matrix4): Matrix4 {
    const m = matrix.values;
    const r = result.values;

    const m00 = m[0], m01 = m[1], m02 = m[2], m03 = m[3];
    const m10 = m[4], m11 = m[5], m12 = m[6], m13 = m[7];
    const m20 = m[8], m21 = m[9], m22 = m[10], m23 = m[11];
    const m30 = m[12], m31 = m[13], m32 = m[14], m33 = m[15];

    const b00 = m00 * m11 - m01 * m10;
    const b01 = m00 * m12 - m02 * m10;
    const b02 = m00 * m13 - m03 * m10;
    const b03 = m01 * m12 - m02 * m11;
    const b04 = m01 * m13 - m03 * m11;
    const b05 = m02 * m13 - m03 * m12;
    const b06 = m20 * m31 - m21 * m30;
    const b07 = m20 * m32 - m22 * m30;
    const b08 = m20 * m33 - m23 * m30;
    const b09 = m21 * m32 - m22 * m31;
    const b10 = m21 * m33 - m23 * m31;
    const b11 = m22 * m33 - m23 * m32;

    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (Math.abs(det) < 1e-15) {
      Matrix4.identity(result);
      return result;
    }
    det = 1.0 / det;

    r[0]  = (m11 * b11 - m12 * b10 + m13 * b09) * det;
    r[1]  = (m02 * b10 - m01 * b11 - m03 * b09) * det;
    r[2]  = (m31 * b05 - m32 * b04 + m33 * b03) * det;
    r[3]  = (m22 * b04 - m21 * b05 - m23 * b03) * det;
    r[4]  = (m12 * b08 - m10 * b11 - m13 * b07) * det;
    r[5]  = (m00 * b11 - m02 * b08 + m03 * b07) * det;
    r[6]  = (m32 * b02 - m30 * b05 - m33 * b01) * det;
    r[7]  = (m20 * b05 - m22 * b02 + m23 * b01) * det;
    r[8]  = (m10 * b10 - m11 * b08 + m13 * b06) * det;
    r[9]  = (m01 * b08 - m00 * b10 - m03 * b06) * det;
    r[10] = (m30 * b04 - m31 * b02 + m33 * b00) * det;
    r[11] = (m21 * b02 - m20 * b04 - m23 * b00) * det;
    r[12] = (m11 * b07 - m10 * b09 - m12 * b06) * det;
    r[13] = (m00 * b09 - m01 * b07 + m02 * b06) * det;
    r[14] = (m31 * b01 - m30 * b03 - m32 * b00) * det;
    r[15] = (m20 * b03 - m21 * b01 + m22 * b00) * det;

    return result;
  }

  /** Extract translation component */
  getTranslation(result?: Cartesian3): Cartesian3 {
    if (!result) result = new Cartesian3();
    result.x = this.values[12];
    result.y = this.values[13];
    result.z = this.values[14];
    return result;
  }

  toFloat32Array(): Float32Array {
    return new Float32Array(this.values);
  }
}

export default Matrix4;
