import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [],
      manifest: {
        name: '测试工具箱',
        short_name: '测试工具',
        description: '测试常用工具聚合，纯浏览器端处理',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#fdf2f8',
        theme_color: '#60a5fa',
        lang: 'zh-CN'
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}']
      }
    })
  ]
})
