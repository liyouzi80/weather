// Cloudflare Pages Function：通用反向代理，解决浏览器直连各天气信源的 CORS 问题。
// 路由：/proxy/<upstream>/<剩余路径>?<query>  ->  对应上游域名。
// 与 vite 开发代理（vite.config.ts）的路径保持一致，开发/生产无缝切换。

const UPSTREAM: Record<string, string> = {
  qweather: 'https://devapi.qweather.com',
  caiyun: 'https://api.caiyunapp.com',
  nmc: 'http://www.nmc.cn',
  twc: 'https://api.weather.com',
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
  try {
    const upstream = await fetch(target, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      },
    })
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
