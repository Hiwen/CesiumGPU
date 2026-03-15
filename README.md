# CesiumGPU

一款仿 Cesium API 的 WebGPU 三维渲染引擎

## 特性

- 🌍 **地球渲染** — WGS84 椭球体，支持影像底图
- 🔦 **延迟渲染管线** — G-Buffer（Albedo / Normal / World-Position）+ 延迟光照，支持大量灯光
- 🌫️ **透明物体渲染** — Weighted Blended Order-Independent Transparency (WBOIT)
- 🎨 **纯 WebGPU** — 不依赖 WebGL，直接使用 WGSL 着色器
- 📐 **仿 Cesium API** — `Viewer`、`Scene`、`Camera`、`Globe`、`Cartesian3`、`Matrix4` 等核心类

## 快速开始

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

浏览器打开 `http://localhost:3000`（需要支持 WebGPU 的浏览器，Chrome 113+）

### 生产构建

```bash
npm run build
```

## API 示例

```typescript
import { Viewer, Cartesian3, Color, Primitive, EllipsoidGeometry } from './src/index';

// 创建 Viewer（仿 Cesium API）
const viewer = new Viewer('cesiumContainer');
await viewer.initialize();

// 设置相机位置（飞到北京上空 10000 km）
viewer.camera.flyTo({
  destination: Cartesian3.fromDegrees(116.4, 39.9, 10_000_000),
});

// 加载地球影像
viewer.globe.loadImageryFromUrl('https://example.com/earth.jpg');

// 添加透明大气层球体
const atmosGeom = new EllipsoidGeometry({
  radii: new Cartesian3(6478137, 6478137, 6458137),
});
const { vertices, indices } = atmosGeom.createInterleavedBuffer();
const atmosphere = new Primitive(viewer.scene['_context'], {
  vertices,
  indices,
  color:       new Color(0.3, 0.6, 1.0, 0.15),
  translucent: true,
  alpha:       0.15,
});
viewer.scene.addTransparentPrimitive(atmosphere);
```

## 渲染架构

```
每帧渲染流程:

1. G-Buffer Pass（不透明几何体）
   ├── Target 0: Albedo   (rgba8unorm)
   ├── Target 1: Normal   (rgba16float)
   └── Target 2: WorldPos (rgba32float)

2. Lighting Pass（延迟光照 — 全屏三角形）
   ├── 读取 G-Buffer
   ├── Blinn-Phong 漫反射 + 高光
   ├── 大气散射边缘效果
   └── Tone Mapping + Gamma 矫正

3. Transparent Accumulation Pass（WBOIT 累积）
   ├── 加权颜色积累 (rgba16float)
   └── 透明度乘积 (r8unorm)

4. Transparent Composite Pass（透明混合）
   └── 与不透明场景混合
```

## 数学库

| 类 | 描述 |
|---|---|
| `Cartesian2` | 二维向量 |
| `Cartesian3` | 三维向量 / ECEF 坐标 |
| `Cartesian4` | 四维向量 |
| `Matrix4` | 4×4 矩阵（列主序） |
| `Quaternion` | 四元数 |
| `Ellipsoid` | 旋转椭球体（WGS84） |
| `Color` | RGBA 颜色 |
| `CesiumMath` | 数学工具函数 |

## 浏览器支持

需要支持 **WebGPU** 的浏览器：

- Chrome 113+
- Edge 113+
- Firefox Nightly（需开启 `dom.webgpu.enabled` flag）

## 技术栈

- **WebGPU** + **WGSL** 着色器
- **TypeScript**
- **Vite** 构建工具
