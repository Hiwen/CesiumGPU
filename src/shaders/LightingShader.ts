/**
 * Deferred lighting pass shader.
 * Reads G-Buffer textures and computes PBR-style directional lighting.
 * Full-screen triangle approach.
 */
export const LIGHTING_SHADER = /* wgsl */`
// ── Uniforms ──────────────────────────────────────────────────────────────────

struct CameraUniforms {
  viewMatrix      : mat4x4<f32>,
  projMatrix      : mat4x4<f32>,
  viewProjMatrix  : mat4x4<f32>,
  cameraPosition  : vec4<f32>,
  viewportSize    : vec2<f32>,
  nearFar         : vec2<f32>,
}

struct DirectionalLight {
  direction        : vec4<f32>,  // world-space, normalised (w = unused)
  color            : vec4<f32>,  // RGB intensity (w = unused)
  ambientIntensity : f32,
  _pad0            : f32,
  _pad1            : f32,
  _pad2            : f32,
}

struct LightingUniforms {
  lights     : array<DirectionalLight, 8>,
  lightCount : u32,
  _pad0      : u32,
  _pad1      : u32,
  _pad2      : u32,
}

@group(0) @binding(0) var<uniform> camera   : CameraUniforms;
@group(0) @binding(1) var<uniform> lighting : LightingUniforms;

@group(1) @binding(0) var gAlbedo   : texture_2d<f32>;
@group(1) @binding(1) var gNormal   : texture_2d<f32>;
@group(1) @binding(2) var gWorldPos : texture_2d<f32>;
@group(1) @binding(3) var gSampler  : sampler;

// ── Full-screen triangle vertex shader ────────────────────────────────────────

struct VSOut {
  @builtin(position) pos : vec4<f32>,
  @location(0)       uv  : vec2<f32>,
}

@vertex
fn vs_main(@builtin(vertex_index) vid: u32) -> VSOut {
  // Generate a full-screen triangle (covers the entire NDC quad)
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

// ── Deferred lighting fragment shader ─────────────────────────────────────────

fn computeDirectionalLight(
  light    : DirectionalLight,
  normal   : vec3<f32>,
  viewDir  : vec3<f32>,
  albedo   : vec3<f32>,
) -> vec3<f32> {
  let L = normalize(-light.direction.xyz);
  let H = normalize(L + viewDir);

  // Lambertian diffuse
  let NdotL = max(dot(normal, L), 0.0);
  let diffuse = albedo * NdotL;

  // Blinn-Phong specular (simple)
  let NdotH = max(dot(normal, H), 0.0);
  let specular = pow(NdotH, 32.0) * 0.3;

  let ambient = albedo * light.ambientIntensity;

  return (diffuse + specular) * light.color.rgb + ambient;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let texCoord = in.uv;

  let albedo4   = textureSample(gAlbedo,   gSampler, texCoord);
  let normal4   = textureSample(gNormal,   gSampler, texCoord);
  let worldPos4 = textureSample(gWorldPos, gSampler, texCoord);

  // Skip background pixels (alpha == 0 in G-Buffer)
  if (worldPos4.w < 0.5) {
    discard;
  }

  let albedo   = albedo4.rgb;
  let normal   = normalize(normal4.xyz);
  let worldPos = worldPos4.xyz;
  let viewDir  = normalize(camera.cameraPosition.xyz - worldPos);

  var color = vec3<f32>(0.0);

  for (var i: u32 = 0u; i < lighting.lightCount; i++) {
    color += computeDirectionalLight(lighting.lights[i], normal, viewDir, albedo);
  }

  // Atmospheric haze: slight blue tint near limb
  let earthCenter = vec3<f32>(0.0, 0.0, 0.0);
  let toSurface   = normalize(worldPos - earthCenter);
  let limbFactor  = 1.0 - abs(dot(toSurface, viewDir));
  let haze = vec3<f32>(0.1, 0.2, 0.4) * pow(limbFactor, 3.0) * 0.8;

  color = color + haze;

  // Tone mapping (Reinhard)
  color = color / (color + vec3<f32>(1.0));

  // Gamma correction
  color = pow(color, vec3<f32>(1.0 / 2.2));

  return vec4<f32>(color, 1.0);
}
`;

export default LIGHTING_SHADER;
