import { Context } from '../renderer/Context';
import { Primitive } from './Primitive';
import { EllipsoidGeometry } from './EllipsoidGeometry';
import { Color } from '../math/Color';
import { Matrix4 } from '../math/Matrix4';
import { Cartesian3 } from '../math/Cartesian3';

export interface GlobeOptions {
  /** Number of longitude partitions. Default: 128 */
  stackPartitions?: number;
  /** Number of latitude partitions. Default: 64 */
  slicePartitions?: number;
  /** Base ocean/land color (used when no imagery is loaded). */
  baseColor?: Color;
}

/**
 * Globe - Renders the Earth as a WGS84 ellipsoid.
 * Matches Cesium's Globe API.
 */
export class Globe {
  /** Show/hide the globe. */
  show: boolean = true;

  /** Base colour (ocean/land) shown when no imagery layer is loaded. */
  baseColor: Color;

  private _context: Context;
  private _primitive: Primitive | null = null;
  private _options: Required<GlobeOptions>;
  private _imageryTexture: GPUTexture | null = null;

  /** Scale factor: globe radius in normalised units = 1.0 */
  static readonly RADIUS = 1.0;

  constructor(context: Context, options: GlobeOptions = {}) {
    this._context = context;
    this._options = {
      stackPartitions: options.stackPartitions ?? 128,
      slicePartitions: options.slicePartitions ?? 64,
      baseColor:       options.baseColor ?? new Color(0.1, 0.35, 0.6, 1.0),
    };
    this.baseColor = this._options.baseColor;
  }

  /**
   * Build the globe geometry and upload it to the GPU.
   * Call once during scene initialization.
   */
  initialize(): Primitive {
    const geom = new EllipsoidGeometry({
      radii:           new Cartesian3(6378137.0, 6378137.0, 6356752.3142),
      stackPartitions: this._options.stackPartitions,
      slicePartitions: this._options.slicePartitions,
    });

    const { vertices, indices } = geom.createInterleavedBuffer();

    this._primitive = new Primitive(this._context, {
      vertices,
      indices,
      color:       this.baseColor,
      translucent: false,
    });

    // Scale model matrix: the geometry is built on a unit sphere, scale by EARTH_SCALE
    // so the globe fills the normalised space (radius = 1).
    // Since EllipsoidGeometry normalises radii to 1.0, the model matrix is identity.
    Matrix4.identity(this._primitive.modelMatrix);

    return this._primitive;
  }

  get primitive(): Primitive | null { return this._primitive; }

  /**
   * Load a texture from an HTMLImageElement and apply it to the globe.
   */
  loadImageryTexture(image: HTMLImageElement): void {
    if (!this._primitive) return;
    const device = this._context.device;

    const bitmap = createImageBitmap(image).then(bitmap => {
      const texture = device.createTexture({
        label:  'Globe.Imagery',
        size:   { width: bitmap.width, height: bitmap.height },
        format: 'rgba8unorm',
        usage:  GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
        mipLevelCount: 1,
      });

      device.queue.copyExternalImageToTexture(
        { source: bitmap },
        { texture },
        { width: bitmap.width, height: bitmap.height }
      );

      // TODO: generate mipmaps if needed

      const sampler = device.createSampler({
        minFilter:    'linear',
        magFilter:    'linear',
        addressModeU: 'repeat',
        addressModeV: 'clamp-to-edge',
        maxAnisotropy: 4,
      });

      this._imageryTexture?.destroy();
      this._imageryTexture = texture;
      this._primitive?.setTexture(texture, sampler);
      bitmap.close();
    });

    void bitmap;
  }

  /**
   * Generate and apply a procedural Earth-like texture entirely in the browser.
   * Uses a 2D canvas with trig-based continent approximation, ocean gradients
   * and polar ice caps. No network request needed.
   */
  generateProceduralTexture(): void {
    if (!this._primitive) return;

    const W = 1024, H = 512;
    const canvas = document.createElement('canvas');
    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    const imgData = ctx.createImageData(W, H);
    const data = imgData.data;

    for (let py = 0; py < H; py++) {
      // lat in [-π/2, π/2], lon in [-π, π]
      const lat = (0.5 - (py + 0.5) / H) * Math.PI; // py=0 → +π/2 (north pole), py=H-1 → -π/2 (south pole)
      const absLat = Math.abs(lat);

      for (let px = 0; px < W; px++) {
        const lon = ((px + 0.5) / W - 0.5) * 2 * Math.PI;
        const i = (py * W + px) * 4;

        // ── Polar ice caps ────────────────────────────────────────────────
        if (absLat > 1.22) { // > ~70°
          const blend = Math.min(1, (absLat - 1.22) / 0.35);
          data[i]   = Math.round(210 + 45 * blend);
          data[i+1] = Math.round(225 + 30 * blend);
          data[i+2] = Math.round(235 + 20 * blend);
          data[i+3] = 255;
          continue;
        }

        // ── Continent mask (trig-based approximation) ─────────────────────
        // Weighted sum of harmonics: positive → land, negative → ocean
        const n =
          0.4 * Math.sin(lon * 1.5 - 0.4) * Math.cos(lat * 2.2) +
          0.3 * Math.sin(lon * 3.0 + 1.0) * Math.cos(lat * 1.8 + 0.3) +
          0.2 * Math.sin(lon * 2.5 + 2.5) * Math.cos(lat * 3.5 - 0.5) +
          0.15 * Math.cos(lon * 4.0 - 1.0) * Math.sin(lat * 2.0 + 1.0);
        const land = n > 0.08;

        // ── Ocean: dark blue → lighter blue by latitude ───────────────────
        if (!land) {
          const depthShade = 0.6 + 0.4 * Math.cos(lat);
          data[i]   = Math.round(15  + 25  * depthShade);
          data[i+1] = Math.round(60  + 55  * depthShade);
          data[i+2] = Math.round(130 + 70  * depthShade);
          data[i+3] = 255;
        } else {
          // ── Land: green lowlands → brownish highlands ─────────────────
          const elevation = Math.max(0, n - 0.08);
          const highFactor = Math.min(1, elevation * 5);
          const r = Math.round(40  + 100 * highFactor + 20 * (1 - highFactor));
          const g = Math.round(110 - 30  * highFactor + 30 * (1 - highFactor));
          const b = Math.round(30  + 20  * highFactor);
          // Snow line on high terrain
          if (elevation > 0.18) {
            const snowBlend = Math.min(1, (elevation - 0.18) / 0.10);
            data[i]   = Math.round(r + (220 - r) * snowBlend);
            data[i+1] = Math.round(g + (225 - g) * snowBlend);
            data[i+2] = Math.round(b + (230 - b) * snowBlend);
          } else {
            data[i]   = r;
            data[i+1] = g;
            data[i+2] = b;
          }
          data[i+3] = 255;
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);

    createImageBitmap(canvas).then(bitmap => {
      const device = this._context.device;
      const texture = device.createTexture({
        label:         'Globe.ProceduralEarth',
        size:          { width: bitmap.width, height: bitmap.height },
        format:        'rgba8unorm',
        usage:         GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
        mipLevelCount: 1,
      });
      device.queue.copyExternalImageToTexture(
        { source: bitmap },
        { texture },
        { width: bitmap.width, height: bitmap.height }
      );
      bitmap.close();

      const sampler = device.createSampler({
        minFilter:    'linear',
        magFilter:    'linear',
        addressModeU: 'repeat',
        addressModeV: 'clamp-to-edge',
      });

      this._imageryTexture?.destroy();
      this._imageryTexture = texture;
      this._primitive?.setTexture(texture, sampler);
    }).catch(console.error);
  }

  /**
   * Load imagery from a URL.
   */
  async loadImageryFromUrl(url: string): Promise<void> {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      img.onload  = () => resolve();
      img.onerror = () => reject(new Error(`Failed to load imagery: ${url}`));
      img.src     = url;
    });
    this.loadImageryTexture(img);
  }

  destroy(): void {
    this._primitive?.destroy();
    this._imageryTexture?.destroy();
  }
}

export default Globe;
