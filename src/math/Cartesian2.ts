/**
 * Cartesian2 - 2D Cartesian coordinates, matching Cesium's Cartesian2 API.
 */
export class Cartesian2 {
  constructor(
    public x: number = 0.0,
    public y: number = 0.0
  ) {}

  static readonly ZERO = Object.freeze(new Cartesian2(0, 0));
  static readonly ONE = Object.freeze(new Cartesian2(1, 1));
  static readonly UNIT_X = Object.freeze(new Cartesian2(1, 0));
  static readonly UNIT_Y = Object.freeze(new Cartesian2(0, 1));

  clone(result?: Cartesian2): Cartesian2 {
    if (!result) return new Cartesian2(this.x, this.y);
    result.x = this.x;
    result.y = this.y;
    return result;
  }

  equals(right?: Cartesian2): boolean {
    return this === right || (!!right && this.x === right.x && this.y === right.y);
  }

  toString(): string {
    return `(${this.x}, ${this.y})`;
  }

  static fromArray(array: number[], offset: number = 0, result?: Cartesian2): Cartesian2 {
    if (!result) result = new Cartesian2();
    result.x = array[offset];
    result.y = array[offset + 1];
    return result;
  }

  static clone(cartesian: Cartesian2, result?: Cartesian2): Cartesian2 {
    return cartesian.clone(result);
  }

  static add(left: Cartesian2, right: Cartesian2, result: Cartesian2): Cartesian2 {
    result.x = left.x + right.x;
    result.y = left.y + right.y;
    return result;
  }

  static subtract(left: Cartesian2, right: Cartesian2, result: Cartesian2): Cartesian2 {
    result.x = left.x - right.x;
    result.y = left.y - right.y;
    return result;
  }

  static multiplyByScalar(cartesian: Cartesian2, scalar: number, result: Cartesian2): Cartesian2 {
    result.x = cartesian.x * scalar;
    result.y = cartesian.y * scalar;
    return result;
  }

  static dot(left: Cartesian2, right: Cartesian2): number {
    return left.x * right.x + left.y * right.y;
  }

  static magnitude(cartesian: Cartesian2): number {
    return Math.sqrt(Cartesian2.magnitudeSquared(cartesian));
  }

  static magnitudeSquared(cartesian: Cartesian2): number {
    return cartesian.x * cartesian.x + cartesian.y * cartesian.y;
  }

  static normalize(cartesian: Cartesian2, result: Cartesian2): Cartesian2 {
    const mag = Cartesian2.magnitude(cartesian);
    result.x = cartesian.x / mag;
    result.y = cartesian.y / mag;
    return result;
  }

  static distance(left: Cartesian2, right: Cartesian2): number {
    const dx = left.x - right.x;
    const dy = left.y - right.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  static negate(cartesian: Cartesian2, result: Cartesian2): Cartesian2 {
    result.x = -cartesian.x;
    result.y = -cartesian.y;
    return result;
  }
}

export default Cartesian2;
