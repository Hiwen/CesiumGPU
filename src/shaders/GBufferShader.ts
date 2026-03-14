/**
 * G-Buffer shader for opaque objects (Earth surface).
 * Outputs: albedo, normal (encoded), world position to G-Buffer render targets.
 */
export const GBUFFER_SHADER = /* wgsl */`
// ── Uniforms ──────────────────────────────────────────────────────────────────

struct CameraUniforms {
  viewMatrix      : mat4x4<f32>,
  projMatrix      : mat4x4<f32>,
  viewProjMatrix  : mat4x4<f32>,
  cameraPosition  : vec4<f32>,   // world-space camera position (w = unused)
  viewportSize    : vec2<f32>,
  nearFar         : vec2<f32>,   // x = near, y = far
}

struct ModelUniforms {
  modelMatrix  : mat4x4<f32>,
  normalMatrix : mat4x4<f32>,  // upper-left 3x3 of inverse-transpose model matrix
}

@group(0) @binding(0) var<uniform> camera : CameraUniforms;
@group(1) @binding(0) var<uniform> model  : ModelUniforms;
@group(1) @binding(1) var baseColorTexture : texture_2d<f32>;
@group(1) @binding(2) var baseColorSampler : sampler;

// ── Vertex I/O ────────────────────────────────────────────────────────────────

struct VertexInput {
  @location(0) position : vec3<f32>,
  @location(1) normal   : vec3<f32>,
  @location(2) uv       : vec2<f32>,
}

struct VertexOutput {
  @builtin(position) clipPosition : vec4<f32>,
  @location(0) worldPosition      : vec3<f32>,
  @location(1) worldNormal        : vec3<f32>,
  @location(2) uv                 : vec2<f32>,
}

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
  var out: VertexOutput;
  let worldPos4  = model.modelMatrix * vec4<f32>(in.position, 1.0);
  let worldNorm4 = model.normalMatrix * vec4<f32>(in.normal, 0.0);

  out.worldPosition = worldPos4.xyz;
  out.worldNormal   = normalize(worldNorm4.xyz);
  out.uv            = in.uv;
  out.clipPosition  = camera.viewProjMatrix * worldPos4;
  return out;
}

// ── G-Buffer Fragment Output ───────────────────────────────────────────────────
// Target 0: albedo       (rgba8unorm)
// Target 1: normal       (rgba16float) — world-space normal in [−1,1]
// Target 2: worldPos     (rgba32float) — world-space position

struct GBufferOutput {
  @location(0) albedo   : vec4<f32>,
  @location(1) normal   : vec4<f32>,
  @location(2) worldPos : vec4<f32>,
}

@fragment
fn fs_main(in: VertexOutput) -> GBufferOutput {
  var out: GBufferOutput;

  // Sample base color texture
  let texColor = textureSample(baseColorTexture, baseColorSampler, in.uv);

  out.albedo   = texColor;
  out.normal   = vec4<f32>(normalize(in.worldNormal), 1.0);
  out.worldPos = vec4<f32>(in.worldPosition, 1.0);

  return out;
}
`;

export default GBUFFER_SHADER;
