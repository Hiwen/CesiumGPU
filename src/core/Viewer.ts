import { Context } from '../renderer/Context';
import { Scene } from '../scene/Scene';
import { Cartesian3 } from '../math/Cartesian3';
import { Camera } from '../scene/Camera';
import { Globe } from '../scene/Globe';
import { Color } from '../math/Color';

export interface ViewerOptions {
  /** GPU power preference. Default: 'high-performance' */
  powerPreference?: GPUPowerPreference;
  /** Initial background color (space). */
  backgroundColor?: Color;
}

/**
 * Viewer - The main CesiumGPU viewer class.
 *
 * Usage:
 * ```typescript
 * const viewer = new Viewer('cesiumContainer');
 * await viewer.initialize();
 * viewer.camera.setView({
 *   destination: Cartesian3.fromDegrees(116.4, 39.9, 10_000_000),
 * });
 * ```
 *
 * Matches Cesium's Viewer API.
 */
export class Viewer {
  private _container: HTMLElement;
  private _canvas: HTMLCanvasElement;
  private _context: Context;
  private _scene: Scene;

  private _animFrameId: number | null = null;
  private _fps = 0;
  private _frameCount = 0;
  private _fpsInterval = 0;
  private _fpsEl: HTMLElement | null = null;

  // Mouse orbit state (left button)
  private _isDragging = false;
  private _lastMouseX = 0;
  private _lastMouseY = 0;

  // Mouse zoom state (right button)
  private _isRightDragging = false;
  private _lastRightMouseY = 0;

  private _initialized = false;
  private _destroyed = false;

  constructor(containerOrId: string | HTMLElement, _options: ViewerOptions = {}) {
    if (typeof containerOrId === 'string') {
      const el = document.getElementById(containerOrId);
      if (!el) throw new Error(`Container element not found: ${containerOrId}`);
      this._container = el;
    } else {
      this._container = containerOrId;
    }

    // Create canvas
    this._canvas = document.createElement('canvas');
    this._canvas.style.cssText = 'display:block;width:100%;height:100%;';
    this._container.appendChild(this._canvas);

    this._context = new Context(this._canvas);
    this._scene   = new Scene(this._context);

    // Look for FPS display element
    this._fpsEl = document.getElementById('fps');
  }

  // ── Accessors (Cesium-compatible) ─────────────────────────────────────────

  get scene(): Scene  { return this._scene; }
  get camera(): Camera { return this._scene.camera; }
  get globe(): Globe   { return this._scene.globe; }
  get canvas(): HTMLCanvasElement { return this._canvas; }

  // ── Initialization ────────────────────────────────────────────────────────

  /**
   * Initialize WebGPU and prepare all render resources.
   * Must be awaited before the viewer is usable.
   */
  async initialize(): Promise<void> {
    if (this._initialized) return;

    await this._context.initialize();
    this._resizeCanvas();
    await this._scene.initialize();
    this._initialized = true;

    // Default camera position: 3× Earth radius above equator
    this._scene.camera.position.set(0, 0, 3.0);
    this._scene.camera.setAspectRatio(this._canvas.width / this._canvas.height);

    this._setupInputHandlers();
    this._startRenderLoop();
  }

  /**
   * Stop rendering and release all GPU resources.
   */
  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    if (this._animFrameId !== null) cancelAnimationFrame(this._animFrameId);
    this._scene.destroy();
    this._context.destroy();
    this._canvas.remove();
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private _resizeCanvas(): void {
    const w = this._container.clientWidth  || window.innerWidth;
    const h = this._container.clientHeight || window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    this._canvas.width  = Math.round(w * dpr);
    this._canvas.height = Math.round(h * dpr);
    this._scene.resize(this._canvas.width, this._canvas.height);
  }

  private _startRenderLoop(): void {
    this._fpsInterval = performance.now();

    const loop = (now: number) => {
      if (this._destroyed) return;
      this._animFrameId = requestAnimationFrame(loop);

      this._scene.render();

      // FPS counter
      this._frameCount++;
      if (now - this._fpsInterval >= 500) {
        this._fps = Math.round((this._frameCount * 1000) / (now - this._fpsInterval));
        this._frameCount = 0;
        this._fpsInterval = now;
        if (this._fpsEl) this._fpsEl.textContent = `${this._fps} FPS`;
      }
    };

    this._animFrameId = requestAnimationFrame(loop);
  }

  private _setupInputHandlers(): void {
    const canvas = this._canvas;

    // Resize observer
    const ro = new ResizeObserver(() => this._resizeCanvas());
    ro.observe(this._container);

    // ── Left-button drag → orbit (Cesium-compatible) ───────────────────────
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this._isDragging    = true;
        this._lastMouseX    = e.clientX;
        this._lastMouseY    = e.clientY;
      } else if (e.button === 2) {
        this._isRightDragging = true;
        this._lastRightMouseY = e.clientY;
      }
    });

    window.addEventListener('mousemove', (e) => {
      // Orbit sensitivity scales with camera distance (Cesium behaviour)
      const r = Cartesian3.magnitude(this._scene.camera.position);

      if (this._isDragging) {
        const dx = e.clientX - this._lastMouseX;
        const dy = e.clientY - this._lastMouseY;
        this._lastMouseX = e.clientX;
        this._lastMouseY = e.clientY;

        const sensitivity = r * 0.0003;
        // dy sign matches Cesium: drag DOWN → camera orbits northward (positive deltaLat)
        this._scene.camera.rotate(-dx * sensitivity, dy * sensitivity);
      }

      if (this._isRightDragging) {
        const dy = e.clientY - this._lastRightMouseY;
        this._lastRightMouseY = e.clientY;
        // Right-drag down → zoom out (positive delta = larger radius)
        this._scene.camera.zoom(dy * r * 0.002);
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this._isDragging = false;
      if (e.button === 2) this._isRightDragging = false;
    });

    // Prevent browser context menu when right-clicking the canvas
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // ── Scroll wheel → proportional zoom (Cesium-compatible) ──────────────
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = Cartesian3.magnitude(this._scene.camera.position);
      // Scroll up (deltaY < 0) → zoom in; scroll down → zoom out
      this._scene.camera.zoom(e.deltaY * r * 0.0002);
    }, { passive: false });

    // ── Touch support ──────────────────────────────────────────────────────
    let lastTouchDist = 0;
    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        this._isDragging = true;
        this._lastMouseX = e.touches[0].clientX;
        this._lastMouseY = e.touches[0].clientY;
      } else if (e.touches.length === 2) {
        this._isDragging = false;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastTouchDist = Math.sqrt(dx * dx + dy * dy);
      }
    }, { passive: true });

    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const r = Cartesian3.magnitude(this._scene.camera.position);

      if (e.touches.length === 1 && this._isDragging) {
        const dx = e.touches[0].clientX - this._lastMouseX;
        const dy = e.touches[0].clientY - this._lastMouseY;
        this._lastMouseX = e.touches[0].clientX;
        this._lastMouseY = e.touches[0].clientY;
        const sensitivity = r * 0.0003;
        this._scene.camera.rotate(-dx * sensitivity, dy * sensitivity);
      } else if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        // Pinch apart → zoom in (negative delta), pinch together → zoom out
        this._scene.camera.zoom((lastTouchDist - dist) * r * 0.002);
        lastTouchDist = dist;
      }
    }, { passive: false });

    canvas.addEventListener('touchend', () => { this._isDragging = false; });
  }
}

// Allow `camera.position.set(x, y, z)` by augmenting Cartesian3
declare module '../math/Cartesian3' {
  interface Cartesian3 {
    set(x: number, y: number, z: number): void;
  }
}

Cartesian3.prototype.set = function(x: number, y: number, z: number): void {
  this.x = x; this.y = y; this.z = z;
};

export default Viewer;
