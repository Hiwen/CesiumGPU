import { Viewer } from './core/Viewer';
import { Cartesian3 } from './math/Cartesian3';
import { Color } from './math/Color';
import { Primitive, PrimitiveCollection } from './scene/Primitive';
import { EllipsoidGeometry } from './scene/EllipsoidGeometry';
import { DirectionalLight } from './scene/DirectionalLight';

/**
 * CesiumGPU - WebGPU 3D Earth Rendering Engine
 *
 * Main entry point (used by the demo).
 */
async function main() {
  const container = document.getElementById('cesiumContainer');
  if (!container) return;

  const noWebgpuEl = document.getElementById('no-webgpu');

  try {
    // ── Create viewer ──────────────────────────────────────────────────────
    const viewer = new Viewer('cesiumContainer', {
      powerPreference: 'high-performance',
    });

    await viewer.initialize();

    // ── Set initial camera position ────────────────────────────────────────
    // Position above Beijing (116.4°E, 39.9°N), altitude 20 000 km
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(116.4, 39.9, 20_000_000),
    });

    // ── Load Earth imagery from the bundled local image ────────────────────
    // public/images/world.jpg is served at /images/world.jpg by Vite
    viewer.globe.loadImageryFromUrl('/images/world.jpg').catch(() => {
      // Non-fatal: fall back to procedural texture if the file is missing
      console.warn('CesiumGPU: world.jpg not found, falling back to procedural texture.');
      viewer.globe.generateProceduralTexture();
    });

    console.info('CesiumGPU initialised successfully.');

  } catch (err) {
    console.error('CesiumGPU init error:', err);
    if (noWebgpuEl) noWebgpuEl.style.display = 'block';
  }
}

void main();

// ── Public exports ──────────────────────────────────────────────────────────
export {
  Viewer,
  Cartesian3,
  Color,
  Primitive,
  PrimitiveCollection,
  EllipsoidGeometry,
  DirectionalLight,
};

export { CesiumMath } from './math/CesiumMath';
export { Cartesian2 } from './math/Cartesian2';
export { Cartesian4 } from './math/Cartesian4';
export { Matrix4 } from './math/Matrix4';
export { Quaternion } from './math/Quaternion';
export { Ellipsoid } from './math/Ellipsoid';
export { Scene } from './scene/Scene';
export { Camera } from './scene/Camera';
export { Globe } from './scene/Globe';
