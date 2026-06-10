// /api/aqi — 多源美国 AQI 聚合（服务端抓取站点页并归一化，避免浏览器下载整页 HTML）。
// Query: cityName（如「番禺」「安福」）
// Cloudflare edge cache: 120 s，命中时直接返回，跳过上游抓取。
import { aggregateAqi } from '../_lib/aqi'

const CACHE_TTL = 120

export const onRequest = async (context: { request: Request }): Promise<Response> => {
  const url = new URL(context.request.url)
  const cityName = url.searchParams.get('cityName') ?? '番禺'

  // 边缘缓存：命中则直接返回，跳过上游抓取
  const cache = caches.default
  const cacheKey = new Request(url.toString(), { method: 'GET' })
  const cached = await cache.match(cacheKey)
  if (cached) return cached

  try {
    const data = await aggregateAqi(cityName)
    const response = new Response(JSON.stringify({ ...data, updatedAt: new Date().toISOString() }), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'access-control-allow-origin': '*',
        'cache-control': `public, max-age=${CACHE_TTL}`,
      },
    })
    // clone() 必须在 await cache.put 之前，否则 body 已消耗
    await cache.put(cacheKey, response.clone())
    return response
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 502,
      headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' },
    })
  }
}
