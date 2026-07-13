import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// 本地 dev / 普通 build 用相对路径；部署到 GitHub Pages 项目页（…github.io/<仓库名>/）请用
// npm run build:pages（在 package.json 里把 --base=/仓库名/ 改成与远程仓库名一致）
export default defineConfig({
  base: './',
  server: {
    proxy: {
      '/api/emq-shadow': {
        target: 'http://10.10.20.183:32045',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/emq-shadow/, '') || '/'
      }
    }
  },
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
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,ttf}']
      }
    })
  ]
})
