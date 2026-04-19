import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      // 腾讯云 OCR 服务代理
      '/api/ocr': {
        target: 'https://ocr.tencentcloudapi.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ocr/, ''),
      },
      // 腾讯云混元服务代理
      '/api/hunyuan': {
        target: 'https://hunyuan.tencentcloudapi.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/hunyuan/, ''),
      },
    },
  },
  build: {
    sourcemap: true,
  },
})
