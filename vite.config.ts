import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { scrapeGuangzhou } from './functions/_lib/gz'

// 开发环境插件：在 vite dev server 里实现 /api/gz/realtime，
// 复用与 Cloudflare Pages Function 相同的抓取逻辑，这样本地无需 wrangler 也能调试广州源。
function gzDevApi(): Plugin {
  return {
    name: 'gz-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/gz/realtime', async (_req, res) => {
        res.setHeader('content-type', 'application/json; charset=utf-8')
        try {
          const data = await scrapeGuangzhou()
          res.end(JSON.stringify(data))
        } catch (e) {
          res.statusCode = 502
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }))
        }
      })
    },
  }
}

// 本地开发时通过代理转发到各天气信源，规避浏览器 CORS 限制。
// 生产环境由 functions/proxy/[[path]].ts（Cloudflare Pages Function）承担同样的转发。
export default defineConfig({
  plugins: [react(), gzDevApi()],
  server: {
    host: true,
    proxy: {
      '/proxy/qweather': {
        target: 'https://devapi.qweather.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/proxy\/qweather/, ''),
      },
      '/proxy/caiyun': {
        target: 'https://api.caiyunapp.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/proxy\/caiyun/, ''),
      },
      '/proxy/nmc': {
        target: 'http://www.nmc.cn',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/proxy\/nmc/, ''),
      },
    },
  },
})
