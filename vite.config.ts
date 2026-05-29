import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { scrapeGuangzhou } from './functions/_lib/gz'
import { fetchAppleCurrent } from './functions/_lib/apple'

// 开发环境插件：在 vite dev server 里实现服务端 API（/api/gz/realtime、/api/apple/current），
// 复用与 Cloudflare Pages Function 相同的逻辑，这样本地无需 wrangler 也能调试。
function devApi(mode: string): Plugin {
  // 加载全部环境变量（含非 VITE_ 前缀的 Apple 凭证）
  const env = loadEnv(mode, process.cwd(), '')
  return {
    name: 'dev-api',
    configureServer(server) {
      server.middlewares.use('/api/gz/realtime', async (_req, res) => {
        res.setHeader('content-type', 'application/json; charset=utf-8')
        try {
          res.end(JSON.stringify(await scrapeGuangzhou()))
        } catch (e) {
          res.statusCode = 502
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }))
        }
      })
      server.middlewares.use('/api/apple/current', async (req, res) => {
        res.setHeader('content-type', 'application/json; charset=utf-8')
        try {
          const q = new URL(req.url ?? '', 'http://localhost').searchParams
          const lat = parseFloat(q.get('lat') ?? '')
          const lon = parseFloat(q.get('lon') ?? '')
          res.end(JSON.stringify(await fetchAppleCurrent(env, lat, lon)))
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
export default defineConfig(({ mode }) => ({
  plugins: [react(), devApi(mode)],
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
      '/proxy/twc': {
        target: 'https://api.weather.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/proxy\/twc/, ''),
      },
    },
  },
}))
