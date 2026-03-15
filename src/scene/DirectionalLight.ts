/**
 * DirectionalLight - A directional light source (e.g. the Sun).
 * Matches Cesium's light API pattern.
 */
export class DirectionalLight {
  /** World-space direction the light points toward (normalised). */
  direction: [number, number, number];
  /** RGB colour of the light. */
  color: [number, number, number];
  /** Intensity of the light. */
  intensity: number;
  /** Ambient light contribution. */
  ambientIntensity: number;

  constructor(options: {
    direction?: [number, number, number];
    color?: [number, number, number];
    intensity?: number;
    ambientIntensity?: number;
  } = {}) {
    this.direction       = options.direction       ?? [0.5, -1.0, 0.5];
    this.color           = options.color           ?? [1.0, 0.98, 0.9];
    this.intensity       = options.intensity       ?? 1.0;
    this.ambientIntensity = options.ambientIntensity ?? 0.05;

    // Normalise direction
    const [dx, dy, dz] = this.direction;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len > 0) {
      this.direction = [dx / len, dy / len, dz / len];
    }
  }

  /**
   * Serialise to a Float32Array matching the WGSL DirectionalLight struct layout.
   * Layout (per light, 12 floats → padded to 16 floats = 64 bytes):
   *   direction        : vec4<f32>  (xyz used, w=0)
   *   color            : vec4<f32>  (rgb * intensity, w=0)
   *   ambientIntensity : f32
   *   _pad0,_pad1,_pad2: f32 × 3
   */
  toFloat32Array(): Float32Array {
    const [dx, dy, dz] = this.direction;
    const [cr, cg, cb] = this.color;
    return new Float32Array([
      dx, dy, dz, 0,
      cr * this.intensity, cg * this.intensity, cb * this.intensity, 0,
      this.ambientIntensity, 0, 0, 0,
    ]);
  }
}

export default DirectionalLight;
