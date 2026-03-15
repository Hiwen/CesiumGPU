/**
 * Transparent object rendering using Weighted Blended Order-Independent Transparency (WBOIT).
 *
 * Pass 1 (Accumulation): transparent objects write weighted color + alpha.
 * Pass 2 (Composite): blend accumulated result with opaque scene.
 *
 * Reference: McGuire & Bavoil (2013) "Weighted Blended Order-Independent Transparency"
 */

// ── Accumulation Pass ─────────────────────────────────────────────────────────
export const TRANSPARENT_ACCUMULATION_SHADER = /* wgsl */`
struct CameraUniforms {
  viewMatrix      : mat4x4<f32>,
  projMatrix      : mat4x4<f32>,
  viewProjMatrix  : mat4x4<f32>,
  cameraPosition  : vec4<f32>,
  viewportSize    : vec2<f32>,
  nearFar         : vec2<f32>,
}

struct ModelUniforms {
  modelMatrix  : mat4x4<f32>,
  normalMatrix : mat4x4<f32>,
}

struct MaterialUniforms {
  baseColor : vec4<f32>,   // RGBA; alpha < 1 means transparent
  roughness : f32,
  metallic  : f32,
  _pad0     : f32,
  _pad1     : f32,
}

@group(0) @binding(0) var<uniform> camera   : CameraUniforms;
@group(1) @binding(0) var<uniform> model    : ModelUniforms;
@group(1) @binding(1) var<uniform> material : MaterialUniforms;

struct VSIn {
  @location(0) position : vec3<f32>,
  @location(1) normal   : vec3<f32>,
  @location(2) uv       : vec2<f32>,
}

struct VSOut {
  @builtin(position) clipPos     : vec4<f32>,
  @location(0)       worldPos    : vec3<f32>,
  @location(1)       worldNormal : vec3<f32>,
  @location(2)       uv          : vec2<f32>,
}

@vertex
fn vs_main(in: VSIn) -> VSOut {
  var out: VSOut;
  let worldPos4 = model.modelMatrix * vec4<f32>(in.position, 1.0);
  let worldN4   = model.normalMatrix * vec4<f32>(in.normal, 0.0);
  out.worldPos    = worldPos4.xyz;
  out.worldNormal = normalize(worldN4.xyz);
  out.uv          = in.uv;
  out.clipPos     = camera.viewProjMatrix * worldPos4;
  return out;
}

// WBOIT accumulation outputs
// - accum (rgba16float): weighted sum of (color * alpha * weight)
// - reveal (r8unorm):    product of (1 - alpha), i.e. background visibility
struct FSOut {
  @location(0) accum  : vec4<f32>,
  @location(1) reveal : f32,
}

fn wboitWeight(depth: f32, alpha: f32) -> f32 {
  // McGuire & Bavoil weight function
  let z = depth;
  return alpha * max(1e-2, min(3e3, 10.0 / (1e-5 + pow(z / 5.0, 2.0) + pow(z / 200.0, 6.0))));
}

@fragment
fn fs_accum(in: VSOut) -> FSOut {
  var out: FSOut;

  let alpha     = material.baseColor.a;
  let color     = material.baseColor.rgb;

  // Simple diffuse lighting
  let L      = normalize(vec3<f32>(0.5, 1.0, 0.3));
  let NdotL  = max(dot(normalize(in.worldNormal), L), 0.0) * 0.8 + 0.2;
  let litColor = color * NdotL;

  // Depth used for weight (0 = near, 1 = far in clip space)
  let depth  = in.clipPos.z / in.clipPos.w;
  let weight = wboitWeight(depth, alpha);

  out.accum  = vec4<f32>(litColor * alpha * weight, alpha * weight);
  out.reveal = alpha;

  return out;
}
`;

// ── Composite Pass ────────────────────────────────────────────────────────────
export const TRANSPARENT_COMPOSITE_SHADER = /* wgsl */`
@group(0) @binding(0) var accumTexture  : texture_2d<f32>;
@group(0) @binding(1) var revealTexture : texture_2d<f32>;
@group(0) @binding(2) var gSampler      : sampler;

struct VSOut {
  @builtin(position) pos : vec4<f32>,
  @location(0)       uv  : vec2<f32>,
}

@vertex
fn vs_main(@builtin(vertex_index) vid: u32) -> VSOut {
  var positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 3.0, -1.0),
    vec2<f32>(-1.0,  3.0),
  );
  var uvs = array<vec2<f32>, 3>(
    vec2<f32>(0.0, 1.0),
    vec2<f32>(2.0, 1.0),
    vec2<f32>(0.0, -1.0),
  );
  var out: VSOut;
  out.pos = vec4<f32>(positions[vid], 0.0, 1.0);
  out.uv  = uvs[vid];
  return out;
}

@fragment
fn fs_composite(in: VSOut) -> @location(0) vec4<f32> {
  let accum  = textureSample(accumTexture,  gSampler, in.uv);
  let reveal = textureSample(revealTexture, gSampler, in.uv).r;

  // Background visibility = 1 - accumulated alpha products
  let backgroundVisibility = 1.0 - reveal;

  // Average colour of all transparent layers
  let avgColor = accum.rgb / max(accum.a, 1e-5);

  // Blend: transparent layers on top of already-composited opaque scene
  return vec4<f32>(avgColor, backgroundVisibility);
}
`;

export default TRANSPARENT_ACCUMULATION_SHADER;
