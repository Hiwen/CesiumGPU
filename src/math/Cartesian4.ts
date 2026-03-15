/**
 * Cartesian4 - 4D Cartesian coordinates, matching Cesium's Cartesian4 API.
 */
export class Cartesian4 {
  constructor(
    public x: number = 0.0,
    public y: number = 0.0,
    public z: number = 0.0,
    public w: number = 0.0
  ) {}

  static readonly ZERO = Object.freeze(new Cartesian4(0, 0, 0, 0));
  static readonly UNIT_X = Object.freeze(new Cartesian4(1, 0, 0, 0));
  static readonly UNIT_Y = Object.freeze(new Cartesian4(0, 1, 0, 0));
  static readonly UNIT_Z = Object.freeze(new Cartesian4(0, 0, 1, 0));
  static readonly UNIT_W = Object.freeze(new Cartesian4(0, 0, 0, 1));

  clone(result?: Cartesian4): Cartesian4 {
    if (!result) return new Cartesian4(this.x, this.y, this.z, this.w);
    result.x = this.x;
    result.y = this.y;
    result.z = this.z;
    result.w = this.w;
    return result;
  }

  equals(right?: Cartesian4): boolean {
    return (
      this === right ||
      (!!right &&
        this.x === right.x &&
        this.y === right.y &&
        this.z === right.z &&
        this.w === right.w)
    );
  }

  toString(): string {
    return `(${this.x}, ${this.y}, ${this.z}, ${this.w})`;
  }

  static fromArray(array: number[], offset: number = 0, result?: Cartesian4): Cartesian4 {
    if (!result) result = new Cartesian4();
    result.x = array[offset];
    result.y = array[offset + 1];
    result.z = array[offset + 2];
    result.w = array[offset + 3];
    return result;
  }

  static add(left: Cartesian4, right: Cartesian4, result: Cartesian4): Cartesian4 {
    result.x = left.x + right.x;
    result.y = left.y + right.y;
    result.z = left.z + right.z;
    result.w = left.w + right.w;
    return result;
  }

  static subtract(left: Cartesian4, right: Cartesian4, result: Cartesian4): Cartesian4 {
    result.x = left.x - right.x;
    result.y = left.y - right.y;
    result.z = left.z - right.z;
    result.w = left.w - right.w;
    return result;
  }

  static multiplyByScalar(cartesian: Cartesian4, scalar: number, result: Cartesian4): Cartesian4 {
    result.x = cartesian.x * scalar;
    result.y = cartesian.y * scalar;
    result.z = cartesian.z * scalar;
    result.w = cartesian.w * scalar;
    return result;
  }

  static dot(left: Cartesian4, right: Cartesian4): number {
    return left.x * right.x + left.y * right.y + left.z * right.z + left.w * right.w;
  }

  static magnitude(cartesian: Cartesian4): number {
    return Math.sqrt(
      cartesian.x * cartesian.x +
        cartesian.y * cartesian.y +
        cartesian.z * cartesian.z +
        cartesian.w * cartesian.w
    );
  }

  static normalize(cartesian: Cartesian4, result: Cartesian4): Cartesian4 {
    const mag = Cartesian4.magnitude(cartesian);
    result.x = cartesian.x / mag;
    result.y = cartesian.y / mag;
    result.z = cartesian.z / mag;
    result.w = cartesian.w / mag;
    return result;
  }

  toFloat32Array(): Float32Array {
    return new Float32Array([this.x, this.y, this.z, this.w]);
  }
}

export default Cartesian4;
