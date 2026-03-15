import { Cartesian3 } from '../math/Cartesian3';
import { CesiumMath } from '../math/CesiumMath';

export interface EllipsoidGeometryOptions {
  /** Semi-axes in meters. Default: WGS84 */
  radii?: Cartesian3;
  /** Number of subdivisions in the longitude direction. Default: 64 */
  stackPartitions?: number;
  /** Number of subdivisions in the latitude direction. Default: 32 */
  slicePartitions?: number;
}

export interface GeometryBuffers {
  positions: Float32Array;    // vec3 per vertex
  normals: Float32Array;      // vec3 per vertex
  uvs: Float32Array;          // vec2 per vertex
  indices: Uint32Array;       // triangles
  vertexCount: number;
  indexCount: number;
}

/**
 * EllipsoidGeometry - Generates tessellated ellipsoid geometry (UV sphere).
 * Matches Cesium's EllipsoidGeometry API.
 */
export class EllipsoidGeometry {
  private _options: Required<EllipsoidGeometryOptions>;

  constructor(options: EllipsoidGeometryOptions = {}) {
    this._options = {
      radii: options.radii ?? new Cartesian3(6378137.0, 6378137.0, 6356752.3142),
      stackPartitions: options.stackPartitions ?? 64,
      slicePartitions: options.slicePartitions ?? 32,
    };
  }

  /**
   * Generate vertex and index buffers for the ellipsoid.
   * Returns interleaved positions, normals, uvs and triangle indices.
   */
  createGeometry(): GeometryBuffers {
    const { radii, stackPartitions, slicePartitions } = this._options;

    // Normalize radii to unit scale (renderer works in unit-sphere space).
    // The model matrix will scale to actual size.
    const rx = 1.0;
    const ry = radii.y / radii.x;
    const rz = radii.z / radii.x;

    const stacks = stackPartitions;
    const slices = slicePartitions;

    const vertexCount = (stacks + 1) * (slices + 1);
    const positions = new Float32Array(vertexCount * 3);
    const normals   = new Float32Array(vertexCount * 3);
    const uvs       = new Float32Array(vertexCount * 2);

    let vi = 0;
    let ni = 0;
    let ti = 0;

    for (let stack = 0; stack <= stacks; stack++) {
      // phi: [π/2, -π/2] (latitude from north to south)
      const phi = CesiumMath.PI_OVER_TWO - stack * Math.PI / stacks;
      const cosPhi = Math.cos(phi);
      const sinPhi = Math.sin(phi);

      for (let slice = 0; slice <= slices; slice++) {
        // theta: [0, 2π] (longitude)
        const theta = slice * CesiumMath.TWO_PI / slices;
        const cosTheta = Math.cos(theta);
        const sinTheta = Math.sin(theta);

        // Unit-sphere position (with ellipsoid scaling)
        const nx = cosPhi * cosTheta;
        const ny = cosPhi * sinTheta;
        const nz = sinPhi;

        // Ellipsoid surface normal direction (normalised for a sphere = same as position on unit sphere)
        // For a general ellipsoid, the geodetic normal differs from the surface position.
        const nx2 = nx / (rx * rx);
        const ny2 = ny / (ry * ry);
        const nz2 = nz / (rz * rz);
        const nLen = Math.sqrt(nx2 * nx2 + ny2 * ny2 + nz2 * nz2);

        positions[vi]     = rx * nx;
        positions[vi + 1] = ry * ny;
        positions[vi + 2] = rz * nz;
        vi += 3;

        normals[ni]     = nx2 / nLen;
        normals[ni + 1] = ny2 / nLen;
        normals[ni + 2] = nz2 / nLen;
        ni += 3;

        uvs[ti]     = slice / slices;
        uvs[ti + 1] = stack / stacks;
        ti += 2;
      }
    }

    // Generate indices
    const indexCount = stacks * slices * 6;
    const indices = new Uint32Array(indexCount);
    let idx = 0;
    const stride = slices + 1;

    for (let stack = 0; stack < stacks; stack++) {
      for (let slice = 0; slice < slices; slice++) {
        const a = stack * stride + slice;
        const b = a + stride;
        const c = b + 1;
        const d = a + 1;

        // Two triangles per quad
        indices[idx++] = a;
        indices[idx++] = b;
        indices[idx++] = d;

        indices[idx++] = b;
        indices[idx++] = c;
        indices[idx++] = d;
      }
    }

    return { positions, normals, uvs, indices, vertexCount, indexCount };
  }

  /**
   * Returns interleaved vertex buffer: [position(3), normal(3), uv(2)] per vertex.
   */
  createInterleavedBuffer(): { vertices: Float32Array; indices: Uint32Array; vertexCount: number; indexCount: number } {
    const { positions, normals, uvs, indices, vertexCount, indexCount } = this.createGeometry();

    const stride = 8; // 3 + 3 + 2 floats per vertex
    const vertices = new Float32Array(vertexCount * stride);

    for (let i = 0; i < vertexCount; i++) {
      const vi = i * stride;
      vertices[vi]     = positions[i * 3];
      vertices[vi + 1] = positions[i * 3 + 1];
      vertices[vi + 2] = positions[i * 3 + 2];
      vertices[vi + 3] = normals[i * 3];
      vertices[vi + 4] = normals[i * 3 + 1];
      vertices[vi + 5] = normals[i * 3 + 2];
      vertices[vi + 6] = uvs[i * 2];
      vertices[vi + 7] = uvs[i * 2 + 1];
    }

    return { vertices, indices, vertexCount, indexCount };
  }
}

export default EllipsoidGeometry;
