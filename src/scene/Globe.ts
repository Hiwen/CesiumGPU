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
        mipLevelCount: Math.floor(Math.log2(Math.max(bitmap.width, bitmap.height))) + 1,
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
        mipmapFilter: 'linear',
        addressModeU: 'repeat',
        addressModeV: 'clamp-to-edge',
        maxAnisotropy: 4,
      });

      this._imageryTexture = texture;
      this._primitive?.setTexture(texture, sampler);
      bitmap.close();
    });

    void bitmap;
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
