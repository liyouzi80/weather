// Cloudflare Pages Function：通用反向代理，解决浏览器直连各天气信源的 CORS 问题。
// 路由：/proxy/<upstream>/<剩余路径>?<query>  ->  对应上游域名。
// 转发请求方法与请求体（支持 POST），与 vite 开发代理（vite.config.ts）路径一致。

const UPSTREAM: Record<string, string> = {
  qweather: 'https://devapi.qweather.com',
  caiyun: 'https://api.caiyunapp.com',
  nmc: 'http://www.nmc.cn',
  weatherapi: 'https://api.weatherapi.com',
  weathercn: 'http://d1.weather.com.cn',
  tencent: 'https://wis.qq.com',
  airquality: 'https://air-quality.com',
  iqaircn: 'https://www.iqair.cn',
}

// 部分上游需带特定请求头才返回数据
const EXTRA_HEADERS: Record<string, Record<string, string>> = {
  weathercn: { Referer: 'http://www.weather.com.cn/' },
  airquality: { Referer: 'https://air-quality.com/', 'X-Requested-With': 'XMLHttpRequest' },
}

export const onRequest = async (context: { request: Request }): Promise<Response> => {
  const url = new URL(context.request.url)
  const rest = url.pathname.replace(/^\/proxy\//, '')
  const slash = rest.indexOf('/')
  const key = slash === -1 ? rest : rest.slice(0, slash)
  const tail = slash === -1 ? '' : rest.slice(slash)

  const base = UPSTREAM[key]
  if (!base) {
    return json({ error: `未知上游：${key}` }, 404)
  }

  const target = base + tail + url.search
  const method = context.request.method
  try {
    const headers: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      ...(EXTRA_HEADERS[key] ?? {}),
    }
    const ct = context.request.headers.get('content-type')
    if (ct) headers['content-type'] = ct

    const init: RequestInit = { method, headers }
    if (method !== 'GET' && method !== 'HEAD') {
      init.body = await context.request.arrayBuffer()
    }

    const upstream = await fetch(target, init)
    const body = await upstream.arrayBuffer()
    return new Response(body, {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') ?? 'application/json; charset=utf-8',
        'access-control-allow-origin': '*',
        'cache-control': 'public, max-age=120',
      },
    })
  } catch (e) {
    return json({ error: `代理失败：${e instanceof Error ? e.message : String(e)}` }, 502)
  }
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' },
  })
}
