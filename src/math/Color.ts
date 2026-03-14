/**
 * Color - RGBA color class matching Cesium's Color API.
 */
export class Color {
  constructor(
    public red: number = 0.0,
    public green: number = 0.0,
    public blue: number = 0.0,
    public alpha: number = 1.0
  ) {}

  static readonly WHITE = Object.freeze(new Color(1, 1, 1, 1));
  static readonly BLACK = Object.freeze(new Color(0, 0, 0, 1));
  static readonly RED = Object.freeze(new Color(1, 0, 0, 1));
  static readonly GREEN = Object.freeze(new Color(0, 1, 0, 1));
  static readonly BLUE = Object.freeze(new Color(0, 0, 1, 1));
  static readonly YELLOW = Object.freeze(new Color(1, 1, 0, 1));
  static readonly CYAN = Object.freeze(new Color(0, 1, 1, 1));
  static readonly MAGENTA = Object.freeze(new Color(1, 0, 1, 1));
  static readonly TRANSPARENT = Object.freeze(new Color(0, 0, 0, 0));
  static readonly CORNFLOWERBLUE = Object.freeze(new Color(0.392, 0.584, 0.929, 1));

  clone(result?: Color): Color {
    if (!result) return new Color(this.red, this.green, this.blue, this.alpha);
    result.red = this.red;
    result.green = this.green;
    result.blue = this.blue;
    result.alpha = this.alpha;
    return result;
  }

  /**
   * Create from CSS hex string (e.g. '#FF8800' or '#F80').
   */
  static fromCssColorString(color: string, result?: Color): Color {
    if (!result) result = new Color();
    const hex = color.replace('#', '');
    if (hex.length === 3) {
      result.red   = parseInt(hex[0] + hex[0], 16) / 255;
      result.green = parseInt(hex[1] + hex[1], 16) / 255;
      result.blue  = parseInt(hex[2] + hex[2], 16) / 255;
      result.alpha = 1.0;
    } else if (hex.length >= 6) {
      result.red   = parseInt(hex.substring(0, 2), 16) / 255;
      result.green = parseInt(hex.substring(2, 4), 16) / 255;
      result.blue  = parseInt(hex.substring(4, 6), 16) / 255;
      result.alpha = hex.length >= 8 ? parseInt(hex.substring(6, 8), 16) / 255 : 1.0;
    }
    return result;
  }

  static fromBytes(r: number, g: number, b: number, a: number = 255, result?: Color): Color {
    if (!result) result = new Color();
    result.red   = r / 255;
    result.green = g / 255;
    result.blue  = b / 255;
    result.alpha = a / 255;
    return result;
  }

  withAlpha(alpha: number, result?: Color): Color {
    return this.clone(result).withAlpha(alpha);
  }

  toFloat32Array(): Float32Array {
    return new Float32Array([this.red, this.green, this.blue, this.alpha]);
  }

  equals(right?: Color): boolean {
    return (
      this === right ||
      (!!right &&
        this.red === right.red &&
        this.green === right.green &&
        this.blue === right.blue &&
        this.alpha === right.alpha)
    );
  }

  toString(): string {
    return `Color(${this.red}, ${this.green}, ${this.blue}, ${this.alpha})`;
  }
}

export default Color;
