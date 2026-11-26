import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
    host: true,
    open: false,
    https: process.env.VITE_HTTPS === 'true'
  },
  build: {
    // three.module.js supera 500 kB sin splitting interno posible, pero se carga en chunk aislado
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three/examples')) return 'three-addons';
          if (id.includes('node_modules/three')) return 'three-vendor';
          if (id.includes('node_modules/gsap')) return 'gsap-vendor';
        }
      }
    }
  }
});
