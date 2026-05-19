import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
    // three/examples/jsm/* used by ProductCustomizer3D resolves separately
    // from the main `three` package by default, producing two Three instances
    // and breaking r3f/drei interop (instanceof THREE.Mesh fails across copies).
    dedupe: ['three'],
  },
  optimizeDeps: {
    include: [
      'three',
      'three/examples/jsm/geometries/DecalGeometry.js',
    ],
  },
  build: {
    // Disable sourcemaps in production to avoid leaking source code.
    // Flip to true and upload to Sentry instead for crash symbolication.
    sourcemap: false,
    // Increase warning limit — three.js + recharts naturally push us past 500kb
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // Split heavy vendor libraries into their own chunks so the customer
        // bundle isn't blocked on parsing three.js, etc. Names are stable so
        // CDN caching works across deploys (only the chunks that change bust).
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router', 'react-router-dom'],
          'vendor-three': ['three', '@react-three/fiber', '@react-three/drei'],
          'vendor-charts': ['recharts'],
          'vendor-ui': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-tabs',
            '@radix-ui/react-tooltip',
            '@radix-ui/react-select',
            '@radix-ui/react-popover',
          ],
        },
      },
    },
  },
})
