import { Viewer } from './core/Viewer';
import { Clock } from './core/Clock';
import { Cartesian3 } from './math/Cartesian3';
import { Matrix4 } from './math/Matrix4';
import { Transforms } from './math/Transforms';
import { JulianDate } from './math/JulianDate';
import { Color } from './math/Color';
import { Primitive, PrimitiveCollection } from './scene/Primitive';
import { EllipsoidGeometry } from './scene/EllipsoidGeometry';
import { DirectionalLight } from './scene/DirectionalLight';
import { SunPosition } from './scene/SunPosition';
import { Model } from './scene/Model';
import { Camera } from './scene/Camera';

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

    // ── Clock (simulation time) ────────────────────────────────────────────
    // Start at noon UTC on today's date so the sun is visible immediately.
    const today = new Date();
    today.setUTCHours(12, 0, 0, 0);
    const clock = new Clock({
      currentTime:   JulianDate.fromDate(today),
      multiplier:    3600,   // 1 real second = 1 simulation hour (default)
      shouldAnimate: false,  // user must press play
    });

    // ── Timeline UI wiring ─────────────────────────────────────────────────
    const tlPlayPause = document.getElementById('tlPlayPause') as HTMLButtonElement | null;
    const tlDateEl    = document.getElementById('tlDate')      as HTMLInputElement   | null;
    const tlSlider    = document.getElementById('tlSlider')    as HTMLInputElement   | null;
    const tlTimeEl    = document.getElementById('tlTime')      as HTMLElement        | null;
    const tlSpeedEl   = document.getElementById('tlSpeed')     as HTMLSelectElement  | null;

    /** Pad a number to 2 digits with a leading zero. */
    const pad2 = (n: number) => String(Math.floor(n)).padStart(2, '0');

    /** Format a JS Date as HH:MM:SS UTC. */
    const formatTime = (d: Date) =>
      `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;

    /** Format a JS Date as a yyyy-MM-dd string for <input type="date">. */
    const formatDate = (d: Date) =>
      `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;

    /** Sync all timeline UI elements to reflect clock.currentTime. */
    const syncUI = () => {
      const d = clock.currentTime.toDate();

      if (tlTimeEl)  tlTimeEl.textContent  = formatTime(d);
      if (tlDateEl && !tlDateEl.matches(':focus'))
        tlDateEl.value = formatDate(d);

      // Time-of-day slider: seconds since midnight UTC
      if (tlSlider && !tlSlider.matches(':active')) {
        const sod = d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds();
        tlSlider.value = String(sod);
      }
    };

    // Play / Pause button
    if (tlPlayPause) {
      tlPlayPause.addEventListener('click', () => {
        clock.toggle();
        tlPlayPause.textContent = clock.shouldAnimate ? '⏸' : '▶';
      });
    }

    // Time-of-day slider → update clock's secondsOfDay
    if (tlSlider) {
      tlSlider.addEventListener('input', () => {
        const sod = Number(tlSlider.value);
        // Keep the current calendar date; replace only the time-of-day
        const d = clock.currentTime.toDate();
        d.setUTCHours(0, 0, 0, 0);
        const newTime = new Date(d.getTime() + sod * 1000);
        clock.currentTime = JulianDate.fromDate(newTime);
        syncUI();
      });
    }

    // Date picker → change the calendar date while keeping the current time-of-day
    if (tlDateEl) {
      // Initialise the date input
      tlDateEl.value = formatDate(today);

      tlDateEl.addEventListener('change', () => {
        const parts = tlDateEl.value.split('-');
        if (parts.length !== 3) return;
        const [y, mo, da] = parts.map(Number);
        const cur = clock.currentTime.toDate();
        const newDate = new Date(Date.UTC(y, mo - 1, da,
          cur.getUTCHours(), cur.getUTCMinutes(), cur.getUTCSeconds()));
        clock.currentTime = JulianDate.fromDate(newDate);
        syncUI();
      });
    }

    // Speed selector
    if (tlSpeedEl) {
      tlSpeedEl.addEventListener('change', () => {
        clock.multiplier = Number(tlSpeedEl.value);
      });
    }

    // ── Pre-render hook: tick clock and update sun direction ───────────────
    const sunLight = viewer.scene.lights[0]; // default directional light = Sun

    viewer.preRender = () => {
      clock.tick();
      syncUI();

      if (sunLight) {
        sunLight.direction = SunPosition.computeSunDirection(clock.currentTime);
      }
    };

    console.info('CesiumGPU initialised successfully.');

    // ── Load cone4-red.glb test model ─────────────────────────────────────
    // Placed above Beijing (116.4°E, 39.9°N) at Earth surface.
    // Scale of 500 km makes it visible from the default 20 000 km camera.
    void _loadConeModel(viewer, Model, Matrix4, Cartesian3, Camera);

  } catch (err) {
    console.error('CesiumGPU init error:', err);
    if (noWebgpuEl) noWebgpuEl.style.display = 'block';
  }
}

void main();

// ── Test model loader ─────────────────────────────────────────────────────────

/**
 * Load the test cone model (public/models/cone4-red.glb) and place it above
 * Beijing using a proper ENU (East-North-Up) reference frame so that the
 * model's +Y axis (GLTF 2.0 Y-up convention) aligns with the local Earth
 * surface normal.
 *
 * Matrix composition:
 *   1. `Transforms.eastNorthUpToFixedFrame(ecef)` – rotates & translates to
 *      ENU frame at Beijing (col0=East, col1=North, col2=Up).
 *   2. `Matrix4.fromRotationX(Math.PI / 2)` – converts GLTF Y-up to ENU
 *      Z-up so the model stands upright on the surface.
 *
 * Scale: 500 000 m (500 km) so the cone is prominent at the initial
 * 20 000 km camera altitude.
 */
async function _loadConeModel(
  viewer: Viewer,
  ModelClass: typeof Model,
  Matrix4Class: typeof Matrix4,
  Cartesian3Class: typeof Cartesian3,
  CameraClass: typeof Camera
): Promise<void> {
  try {
    // ECEF position of Beijing (116.4°E, 39.9°N) at Earth surface level (metres)
    const ecef = Cartesian3Class.fromDegrees(116.4, 39.9, 0);

    // ENU-to-normalised-ECEF matrix at the placement point:
    //   col0 = East, col1 = North, col2 = Up (surface normal), col3 = position
    const enuMatrix = Transforms.eastNorthUpToFixedFrame(ecef);

    // GLTF 2.0 is Y-up; the ENU local frame is Z-up.
    // A +90° rotation around the East (X) axis maps the model's +Y to ENU +Z,
    // so the model stands upright with its top pointing away from Earth.
    const yUpToZUp = Matrix4Class.fromRotationX(Math.PI / 2);

    const placementMatrix = Matrix4.multiply(enuMatrix, yUpToZUp, new Matrix4());

    // Scale: 500 000 m → normalised ECEF units
    const modelScale = 500_000 / CameraClass.EARTH_SCALE;

    const model = await ModelClass.fromGltfAsync({
      url:         '/models/cone4-red.glb',
      scene:       viewer.scene,
      modelMatrix: placementMatrix,
      scale:       modelScale,
    });

    console.info(`CesiumGPU: cone4-red.glb loaded (${model.primitiveCount} primitive(s))`);
  } catch (err) {
    console.warn('CesiumGPU: failed to load cone4-red.glb', err);
  }
}

// ── Public exports ───────────────────────────────────────────────────────────
export {
  Viewer,
  Cartesian3,
  Color,
  Primitive,
  PrimitiveCollection,
  EllipsoidGeometry,
  DirectionalLight,
  Model,
  Camera,
};

export { CesiumMath } from './math/CesiumMath';
export { Cartesian2 } from './math/Cartesian2';
export { Cartesian4 } from './math/Cartesian4';
export { Matrix4 } from './math/Matrix4';
export { Quaternion } from './math/Quaternion';
export { Ellipsoid } from './math/Ellipsoid';
export { JulianDate } from './math/JulianDate';
export { Scene } from './scene/Scene';
export { Globe } from './scene/Globe';
export { Clock } from './core/Clock';
export { SunPosition } from './scene/SunPosition';
export { GltfLoader } from './loader/GltfLoader';
