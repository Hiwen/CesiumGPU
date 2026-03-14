/**
 * CesiumMath - Mathematical utility functions matching Cesium's API.
 */
export namespace CesiumMath {
  export const PI = Math.PI;
  export const TWO_PI = 2.0 * Math.PI;
  export const PI_OVER_TWO = Math.PI / 2.0;
  export const PI_OVER_FOUR = Math.PI / 4.0;
  export const PI_OVER_SIX = Math.PI / 6.0;
  export const ONE_PI = Math.PI;
  export const RADIANS_PER_DEGREE = Math.PI / 180.0;
  export const DEGREES_PER_RADIAN = 180.0 / Math.PI;
  export const EPSILON1 = 0.1;
  export const EPSILON2 = 0.01;
  export const EPSILON6 = 0.000001;
  export const EPSILON7 = 0.0000001;
  export const EPSILON14 = 1e-14;
  export const EPSILON15 = 1e-15;

  export function toRadians(degrees: number): number {
    return degrees * RADIANS_PER_DEGREE;
  }

  export function toDegrees(radians: number): number {
    return radians * DEGREES_PER_RADIAN;
  }

  export function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  export function lerp(p: number, q: number, time: number): number {
    return (1.0 - time) * p + time * q;
  }

  export function negativePiToPi(angle: number): number {
    return zeroToTwoPi(angle + PI) - PI;
  }

  export function zeroToTwoPi(angle: number): number {
    const mod = angle % TWO_PI;
    return mod < 0.0 ? mod + TWO_PI : mod;
  }

  export function equalsEpsilon(
    left: number,
    right: number,
    relativeEpsilon: number = 0,
    absoluteEpsilon: number = relativeEpsilon
  ): boolean {
    const diff = Math.abs(left - right);
    return diff <= absoluteEpsilon || diff <= relativeEpsilon * Math.max(Math.abs(left), Math.abs(right));
  }

  export function isPowerOfTwo(n: number): boolean {
    return n !== 0 && (n & (n - 1)) === 0;
  }

  export function nextPowerOfTwo(n: number): number {
    let result = 1;
    while (result < n) result <<= 1;
    return result;
  }
}

export default CesiumMath;
