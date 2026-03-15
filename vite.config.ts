import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'esnext',
  },
  server: {
    port: 3000,
    open: true,
  },
  // Inline WGSL shader files as raw strings
  assetsInclude: ['**/*.wgsl'],
  plugins: [
    {
      name: 'wgsl-loader',
      transform(src, id) {
        if (id.endsWith('.wgsl')) {
          return {
            code: `export default ${JSON.stringify(src)};`,
            map: null,
          };
        }
      },
    },
  ],
});
