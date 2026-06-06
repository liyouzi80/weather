// Cloudflare Pages Function：抓取广州市气象局·番禺页面，返回归一化实况 JSON。
// 直连 tqyb.com.cn 被 503 时，自动降级到阿里云函数计算兜底。
//
// Pages 环境变量（Settings → Environment variables）：
//   HW_GZ_URL   — 华为云函数 HTTP 触发器地址（必须配置才启用兜底）
//   HW_GZ_TOKEN — 对应华为云函数 AUTH_TOKEN 环境变量的值（可选，不填则不带鉴权头）
import { scrapeGuangzhou } from '../../_lib/gz'

interface Env {
  HW_GZ_URL?: string
  HW_GZ_TOKEN?: string
}

const RESP_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'cache-control': 'public, max-age=60',
  'cdn-cache-control': 'public, max-age=60',
}

export const onRequest = async (ctx: { env: Env }): Promise<Response> => {
  // 1. 先尝试直连
  try {
    const data = await scrapeGuangzhou()
    return new Response(JSON.stringify(data), { headers: RESP_HEADERS })
  } catch (primaryErr) {
    // 直连失败：记录原因，尝试华为云兜底
    const primaryMsg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr)
    const hwUrl = ctx.env.HW_GZ_URL
    if (!hwUrl) {
      // 未配置华为云兜底，直接返回错误
      return new Response(JSON.stringify({ error: primaryMsg }), { status: 502, headers: RESP_HEADERS })
    }

    // 2. 调华为云函数兜底
    try {
      const hwHeaders: Record<string, string> = {}
      if (ctx.env.HW_GZ_TOKEN) hwHeaders['X-Auth-Token'] = ctx.env.HW_GZ_TOKEN
      const res = await fetch(hwUrl, { headers: hwHeaders, signal: AbortSignal.timeout(10_000) })
      if (!res.ok) throw new Error(`HW fallback HTTP ${res.status}`)
      const data = await res.json()
      // 华为云返回的若是错误体，透传给前端而不是当成成功
      if (data && typeof data.error === 'string') {
        return new Response(JSON.stringify({ error: `直连: ${primaryMsg}；兜底: ${data.error}` }), {
          status: 502, headers: RESP_HEADERS,
        })
      }
      return new Response(JSON.stringify(data), { headers: RESP_HEADERS })
    } catch (hwErr) {
      const hwMsg = hwErr instanceof Error ? hwErr.message : String(hwErr)
      return new Response(JSON.stringify({ error: `直连: ${primaryMsg}；兜底: ${hwMsg}` }), {
        status: 502, headers: RESP_HEADERS,
      })
    }
  }
}
