// Cloudflare Pages Function：抓取广州市气象局·番禺页面，返回归一化实况 JSON。
import { scrapeGuangzhou } from '../../_lib/gz'

export const onRequest = async (): Promise<Response> => {
  try {
    const data = await scrapeGuangzhou()
    return new Response(JSON.stringify(data), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'access-control-allow-origin': '*',
        'cache-control': 'public, max-age=300',
      },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 502,
      headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' },
    })
  }
}
