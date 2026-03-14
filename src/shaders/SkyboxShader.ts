/**
 * Skybox/atmosphere background shader.
 * Renders a space background with stars and atmospheric glow.
 */
export const SKYBOX_SHADER = /* wgsl */`
struct CameraUniforms {
  viewMatrix      : mat4x4<f32>,
  projMatrix      : mat4x4<f32>,
  viewProjMatrix  : mat4x4<f32>,
  cameraPosition  : vec4<f32>,
  viewportSize    : vec2<f32>,
  nearFar         : vec2<f32>,
}

@group(0) @binding(0) var<uniform> camera : CameraUniforms;

struct VSOut {
  @builtin(position) pos    : vec4<f32>,
  @location(0)       rayDir : vec3<f32>,
}

@vertex
fn vs_main(@builtin(vertex_index) vid: u32) -> VSOut {
  var positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 3.0, -1.0),
    vec2<f32>(-1.0,  3.0),
  );

  let ndcPos = positions[vid];

  // Reconstruct world-space ray direction from inverse VP matrix
  // (We just use a simple look-up based on NDC for the sky)
  var out: VSOut;
  out.pos = vec4<f32>(ndcPos, 0.9999, 1.0); // depth at far plane
  // Approximate ray direction from NDC
  let invProj = camera.projMatrix; // simplified: pass invViewProj separately if needed
  out.rayDir = vec3<f32>(ndcPos * vec2<f32>(1.0 / camera.projMatrix[0][0], 1.0 / camera.projMatrix[1][1]), -1.0);
  return out;
}

// Simple hash / pseudo-random for star field
fn hash(p: vec3<f32>) -> f32 {
  var pp = fract(p * 0.3183099 + 0.1);
  pp += dot(pp, pp.yxz + 19.19);
  return fract((pp.x + pp.y) * pp.z);
}

fn stars(dir: vec3<f32>) -> f32 {
  let cellSize = 50.0;
  let cell = floor(dir * cellSize);
  let local = fract(dir * cellSize) - 0.5;
  let r = hash(cell);
  let brightness = step(0.998, r); // only ~0.2% of cells have stars
  let dist = length(local);
  return brightness * smoothstep(0.2, 0.0, dist);
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let dir = normalize(in.rayDir);

  // Deep space color gradient
  let spaceColor = mix(
    vec3<f32>(0.01, 0.01, 0.06),  // deep dark blue
    vec3<f32>(0.005, 0.005, 0.02), // almost black
    abs(dir.y)
  );

  // Star field
  let starBrightness = stars(dir * 2.0) * 1.5;
  let starColor = vec3<f32>(starBrightness);

  let finalColor = spaceColor + starColor;

  return vec4<f32>(finalColor, 1.0);
}
`;

export default SKYBOX_SHADER;
