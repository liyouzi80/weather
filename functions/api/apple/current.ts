// Cloudflare Pages Function：服务端调用 Apple WeatherKit，返回归一化实况 JSON。
// 私钥等凭证从 context.env 读取（在 CF 项目设置里配置为加密变量）。
import { fetchAppleCurrent, type AppleEnv } from '../../_lib/apple'

export const onRequest = async (context: { request: Request; env: AppleEnv }): Promise<Response> => {
  const url = new URL(context.request.url)
  const lat = parseFloat(url.searchParams.get('lat') ?? '')
  const lon = parseFloat(url.searchParams.get('lon') ?? '')
  if (isNaN(lat) || isNaN(lon)) {
    return json({ error: '缺少 lat/lon' }, 400)
  }
  try {
    const data = await fetchAppleCurrent(context.env, lat, lon)
    return json(data, 200, 'public, max-age=300')
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502)
  }
}

function json(obj: unknown, status = 200, cache?: string): Response {
  const headers: Record<string, string> = {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
  }
  if (cache) headers['cache-control'] = cache
  return new Response(JSON.stringify(obj), { status, headers })
}
