import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(() => {
  return {
    plugins: [react()],
    css: {
      postcss: {},
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy: {
        '/v1': {
          target: 'http://localhost:8787',
          changeOrigin: true,
          secure: false,
        },
      },
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
    },
  }
})
