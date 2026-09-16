import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // 相对路径，让产物能部署在任何子路径下（GitHub Pages 项目站点是
  // https://<user>.github.io/<repo>/，用默认的 '/' 会让 /assets/* 全部 404 变白页）。
  // './' 同时对自定义域名、Vercel/Netlify 根路径、以及本地 file:// 预览都成立。
  base: './',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5180,
    strictPort: true,
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
})
