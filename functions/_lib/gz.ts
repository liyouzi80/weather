// 广州市气象局·番禺 实况抓取（服务端运行：Cloudflare Pages Function + vite 开发插件共用）。
//
// 番禺页面 http://www.tqyb.com.cn/gzpanyu/ 由 require.js 驱动，实况/预报来自若干
// 形如 `try{ var X = { ... };}catch(e){}` 的 JS 数据文件（均为 UTF-8 编码）：
//
//  1) 实况（数值）：/data/latestWeather/gz_latestWeather.js
//        - baseObtInfo（广州国家基本站 59287）为主，gzObtInfo 为备用站；
//        - 字段：temp 温度℃、rh 湿度%、wd2dd 风向(度)、wd2ds 风速(m/s)、hourrf 时雨量mm；
//        - -999.9 等为缺测哨兵。
//  2) 番禺本地预报（文字）：/data/shorttime/GDPY_shorttime.js
//        - 番禺区气象台发布的短时（未来数小时）预报文字，比基本站实况更贴合番禺本地；
//        - 字段：content 预报正文、ddatetime 发布时间。
//
// 注意：
//  - 文件外层有 try{...}catch 包裹，需用括号配对精确截取对象，不能简单取首尾大括号。
//  - 基本站实况本身无天气现象描述，故以番禺区气象台短时预报作为文字补充。

const ORIGIN = 'http://www.tqyb.com.cn'
const GZ_DATA_URL = `${ORIGIN}/data/latestWeather/gz_latestWeather.js`
const PY_FORECAST_URL = `${ORIGIN}/data/shorttime/GDPY_shorttime.js`

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
  Referer: `${ORIGIN}/gzpanyu/`,
  'X-Requested-With': 'XMLHttpRequest',
}

export interface GzRealtime {
  temp?: number
  feelsLike?: number
  text?: string
  humidity?: number
  windSpeed?: number // km/h
  windDir?: string
  pressure?: number // hPa
  rain1h?: number // mm
  observedAt?: string
  /** 番禺区气象台短时预报正文（文字补充，区别于上方数值实况） */
  forecast?: string
  /** 短时预报发布时间（原始字符串，如「2026年05月29日 17:00」） */
  forecastIssuedAt?: string
}

export async function scrapeGuangzhou(): Promise<GzRealtime> {
  // 实况与番禺预报并行抓取；预报失败不影响实况返回。
  const [rtRes, fcRes] = await Promise.allSettled([
    fetchData(GZ_DATA_URL, 'gz_latestWeather'),
    fetchData(PY_FORECAST_URL, 'GDPY_shorttime'),
  ])

  if (rtRes.status === 'rejected') throw rtRes.reason
  const out = mapData(rtRes.value)

  if (fcRes.status === 'fulfilled') {
    const fc = fcRes.value
    const content = typeof fc?.content === 'string' ? fc.content.trim() : undefined
    const issued = typeof fc?.ddatetime === 'string' ? fc.ddatetime : undefined
    // 时效检测：仅当短时预报仍在有效窗口内才返回（过期不返回，任何消费方都拿不到）。
    if (content && isForecastCurrent(content, issued)) {
      out.forecast = content
      out.forecastIssuedAt = issued
    }
  }
  return out
}

/**
 * 番禺区气象台短时预报时效检测：按"预报窗口结束时间"（北京时）判断是否过期。
 * issued 形如「2026年05月29日 17:00」，content 含「…今天17时到20时…」。
 * 解析不出窗口时回退为"发布后 4 小时"；过期返回 false。
 */
export function isForecastCurrent(content?: string, issued?: string): boolean {
  if (!issued) return true
  const m = issued.match(/(\d{4})年(\d{1,2})月(\d{1,2})日\s*(\d{1,2}):(\d{2})/)
  if (!m) return true
  const Y = +m[1], Mo = +m[2], D = +m[3], H = +m[4], Mi = +m[5]
  // 发布时间为北京时间(UTC+8)，换算成 UTC 毫秒
  const issuedUTC = Date.UTC(Y, Mo - 1, D, H - 8, Mi)
  const now = Date.now()
  if (now < issuedUTC - 3600_000) return true // 时钟偏差保护：发布时间"在未来"则照常显示

  let limitUTC: number
  const em = content ? content.match(/到\s*(\d{1,2})\s*时/) : null
  if (em) {
    const eh = +em[1]
    const dayOffset = eh <= H ? 1 : 0 // 结束小时 ≤ 发布小时视为次日
    limitUTC = Date.UTC(Y, Mo - 1, D + dayOffset, eh - 8, 0)
  } else {
    limitUTC = issuedUTC + 4 * 3600_000
  }
  return now <= limitUTC + 30 * 60_000 // 30 分钟宽限
}

/** 抓取一个 `try{ var <name> = {...};}catch(e){}` 数据文件并解析成对象。 */
async function fetchData(url: string, varName: string): Promise<any> {
  const res = await fetch(`${url}?random=${Math.random()}`, { headers: FETCH_HEADERS })
  if (!res.ok) throw new Error(`数据接口请求失败 HTTP ${res.status}`)
  return extractObject(await res.text(), varName)
}

/** 映射成统一模型：取 gzObtInfo（番禺本地站 G1099），备用 baseObtInfo（广州基本站）。 */
function mapData(d: any): GzRealtime {
  const obt = d?.gzObtInfo ?? d?.baseObtInfo
  if (!obt) throw new Error(`数据缺少 gzObtInfo/baseObtInfo，顶层字段: [${d ? Object.keys(d).join(', ') : d}]`)

  // -999.9 等为缺测哨兵
  const clean = (v: any) => {
    const n = parseFloat(v)
    return isNaN(n) || n <= -999 ? undefined : n
  }

  const temp = clean(obt.temp)
  if (temp == null) throw new Error(`未解析到温度，baseObtInfo 字段: [${Object.keys(obt).join(', ')}]`)

  const speed = clean(obt.wd2ds) // m/s
  const deg = clean(obt.wd2dd) // 度
  const ts = d.gzObtDate ?? d.baseObtDate

  return {
    temp,
    humidity: clean(obt.rh),
    windSpeed: speed != null ? Math.round(speed * 3.6 * 10) / 10 : undefined, // m/s -> km/h
    windDir: deg != null ? degToDir(deg) : undefined,
    rain1h: clean(obt.hourrf),
    text: undefined, // 基本站实况无天气现象描述
    observedAt: ts ? new Date(ts).toISOString() : undefined,
  }
}

/** 从 `var <varName> = { ... };` 中用括号配对精确截取 JSON 对象（兼容外层 try/catch 包裹与字符串内的括号）。 */
function extractObject(text: string, varName: string): any {
  const anchor = text.indexOf(varName)
  const from = text.indexOf('{', anchor >= 0 ? anchor : 0)
  if (from === -1) throw new Error('未找到数据对象起始 {')

  let depth = 0
  let inStr = false
  let strCh = ''
  for (let i = from; i < text.length; i++) {
    const ch = text[i]
    if (inStr) {
      if (ch === strCh && text[i - 1] !== '\\') inStr = false
      continue
    }
    if (ch === '"' || ch === "'") {
      inStr = true
      strCh = ch
    } else if (ch === '{') {
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0) {
        const slice = text.slice(from, i + 1)
        try {
          return JSON.parse(slice)
        } catch (e) {
          throw new Error(`对象解析失败：${e instanceof Error ? e.message : String(e)}`)
        }
      }
    }
  }
  throw new Error('括号不配对，未能截取完整对象')
}

function degToDir(deg: number): string {
  const dirs = ['北', '东北', '东', '东南', '南', '西南', '西', '西北']
  return dirs[Math.round(deg / 45) % 8] + '风'
}
