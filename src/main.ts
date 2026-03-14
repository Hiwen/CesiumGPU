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
    // Fly to a position above Beijing (116.4°E, 39.9°N), altitude 20 000 km
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(116.4, 39.9, 20_000_000),
    });

    // ── Add a transparent atmosphere sphere ────────────────────────────────
    const atmosGeom = new EllipsoidGeometry({
      radii: new Cartesian3(6478137.0, 6478137.0, 6458137.0), // 100 km above surface
      stackPartitions: 64,
      slicePartitions: 32,
    });
    const { vertices: av, indices: ai } = atmosGeom.createInterleavedBuffer();

    const atmospherePrimitive = new Primitive(viewer.scene['_context'], {
      vertices:    av,
      indices:     ai,
      color:       new Color(0.3, 0.6, 1.0, 0.15),
      translucent: true,
      alpha:       0.15,
    });

    viewer.scene.addTransparentPrimitive(atmospherePrimitive);

    // ── Try to load earth imagery (NASA Blue Marble) ───────────────────────
    // Falls back gracefully if image cannot be loaded (CORS / network)
    viewer.globe.loadImageryFromUrl(
      'https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73776/world.topo.bathy.200412.3x5400x2700.jpg'
    ).catch(() => {
      // Non-fatal: plain colour globe is still rendered
      console.info('CesiumGPU: imagery load failed, using base color.');
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
