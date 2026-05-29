// 广州市气象局·番禺 实况抓取（服务端运行：Cloudflare Pages Function + vite 开发插件共用）。
// 目标页面：http://www.tqyb.com.cn/gzpanyu/
//
// ⚠️ 解析说明：该页面无公开 API，只能抓 HTML。由于页面结构可能随时调整，
//    下面用「正则 + 多候选」方式做尽量稳健的抽取；若某天解析不到，
//    按浏览器里实际看到的 HTML/接口调整 PAGE_URL 或 extract() 里的正则即可。
//    （很多此类政府页面其实由内部 XHR 拉 JSON 渲染——若你在开发者工具的
//     Network 里发现这样的 JSON 接口，直接改成请求那个接口会更稳。）

export interface GzRealtime {
  temp?: number
  feelsLike?: number
  text?: string
  humidity?: number
  windSpeed?: number // km/h
  windDir?: string
  observedAt?: string
}

const PAGE_URL = 'http://www.tqyb.com.cn/gzpanyu/'

export async function scrapeGuangzhou(): Promise<GzRealtime> {
  const res = await fetch(PAGE_URL, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      Referer: 'http://www.tqyb.com.cn/',
    },
  })
  if (!res.ok) throw new Error(`页面请求失败 HTTP ${res.status}`)
  const html = await res.text()
  const data = extract(html)
  if (data.temp == null && data.text == null) {
    throw new Error('未能从页面解析到实况数据（结构可能已变，需调整解析规则）')
  }
  return data
}

/** 从 HTML 中抽取实况字段。多组候选正则，命中第一个为准。 */
function extract(html: string): GzRealtime {
  const out: GzRealtime = {}

  out.temp = num(
    pick(html, [
      /(?:实时气温|当前气温|气温|温度)[^0-9\-]*(-?\d+(?:\.\d+)?)\s*(?:°|℃|度)/,
      /(-?\d+(?:\.\d+)?)\s*(?:°C|℃)/,
      /"temp(?:erature)?"\s*:\s*"?(-?\d+(?:\.\d+)?)"?/i,
    ]),
  )

  out.humidity = num(
    pick(html, [
      /(?:相对湿度|湿度)[^0-9]*(\d+(?:\.\d+)?)\s*%/,
      /"(?:humidity|rh)"\s*:\s*"?(\d+(?:\.\d+)?)"?/i,
    ]),
  )

  const text = pick(html, [
    /(?:天气现象|天气状况|天气)[：:\s]*([一-龥]{1,6})/,
    /"(?:weather|skycon|info|text)"\s*:\s*"([^"]{1,12})"/i,
  ])
  if (text) out.text = text.trim()

  out.windDir = pick(html, [
    /([东南西北]{1,2}风|偏[东南西北]风|无持续风向)/,
    /"(?:windDir|wind_dir|direct)"\s*:\s*"([^"]{1,8})"/i,
  ])?.trim()

  const windSpeed = num(
    pick(html, [
      /风速[^0-9]*(\d+(?:\.\d+)?)\s*(?:米\/秒|m\/s)/,
      /"(?:windSpeed|wind_speed|speed)"\s*:\s*"?(\d+(?:\.\d+)?)"?/i,
    ]),
  )
  // 若疑似 m/s，转 km/h
  if (windSpeed != null) out.windSpeed = Math.round(windSpeed * 3.6 * 10) / 10

  const obs = pick(html, [
    /(\d{4}[-/]\d{1,2}[-/]\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?)/,
    /(\d{1,2}月\d{1,2}日\s*\d{1,2}时)/,
  ])
  if (obs) out.observedAt = obs.trim()

  return out
}

function pick(html: string, patterns: RegExp[]): string | undefined {
  for (const re of patterns) {
    const m = html.match(re)
    if (m && m[1]) return m[1]
  }
  return undefined
}

function num(s: string | undefined): number | undefined {
  if (s == null) return undefined
  const n = parseFloat(s)
  return isNaN(n) ? undefined : n
}
