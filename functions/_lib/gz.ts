// 广州市气象局·番禺 实况抓取（服务端运行：Cloudflare Pages Function + vite 开发插件共用）。
//
// 番禺页面 http://www.tqyb.com.cn/gzpanyu/ 由 require.js 驱动，实况/预报来自若干
// 形如 `try{ var X = { ... };}catch(e){}` 的 JS 数据文件（均为 UTF-8 编码）：
//
//  1) 实况（番禺区925站均值）：/data/obtAreaRep/gz_obtAreaRep.js
//        - GDPY 字段为番禺区所有气象站的聚合统计；
//        - 字段值 = 各站累计和×10，z = 统计站点数；均值公式：value / z / 10；
//        - 字段：t 温度℃×10z / rh 湿度%×10z / wdidd 风向(度)×10z / wdidf 风速(m/s)×10z
//                hourrf 时雨量mm×10z / p 气压hPa×10z / ddatetime 观测时间。
//  2) 番禺本地预报（文字）：/data/shorttime/GDPY_shorttime.js
//        - 番禺区气象台发布的短时（未来数小时）预报文字；
//        - 字段：content 预报正文、ddatetime 发布时间。
//  3) 预警信号（JSON）：/data/alarm/panyu/panyu_areaAlarm.js
//        - JSON 数组，每项含 serial 字段（如「暴雨黄色」），无需解析 HTML。
//
// 注意：
//  - 文件外层有 try{...}catch 包裹，需用括号配对精确截取对象/数组，不能简单取首尾括号。
//  - tqyb.com.cn 封锁部分海外 IP（Cloudflare 节点可能被拒），故 PWA 侧三项均可能失败。

const ORIGIN = 'http://www.tqyb.com.cn'
const OBT_AREA_REP_URL = `${ORIGIN}/data/obtAreaRep/gz_obtAreaRep.js`
const PY_FORECAST_URL = `${ORIGIN}/data/shorttime/GDPY_shorttime.js`
const ALARM_URL = `${ORIGIN}/data/alarm/panyu/panyu_areaAlarm.js`

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
  Referer: `${ORIGIN}/gzpanyu/`,
  'X-Requested-With': 'XMLHttpRequest',
}

/** 气象台预警信号 */
export interface GzWarning {
  /** 完整名称，如「雷雨大风黄色预警信号」 */
  title: string
  /** 类型，如「雷雨大风」「暴雨」 */
  type: string
  /** 等级，如「蓝色」「黄色」「橙色」「红色」 */
  level: string
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
  /** 番禺区当前生效的预警信号（无则缺省） */
  warnings?: GzWarning[]
}

export async function scrapeGuangzhou(): Promise<GzRealtime> {
  // 实况、短时预报、预警 JSON 并行抓取；预报/预警失败不影响实况返回。
  const [rtRes, fcRes, alarmRes] = await Promise.allSettled([
    fetchData(OBT_AREA_REP_URL, 'gz_obtAreaRep'),
    fetchData(PY_FORECAST_URL, 'GDPY_shorttime'),
    fetchArray(ALARM_URL, 'panyu_areaAlarm'),
  ])

  if (rtRes.status === 'rejected') throw rtRes.reason
  const out = mapAreaData(rtRes.value)

  if (fcRes.status === 'fulfilled') {
    const fc = fcRes.value
    const content = typeof fc?.content === 'string' ? fc.content.trim() : undefined
    const issued = typeof fc?.ddatetime === 'string' ? fc.ddatetime : undefined
    // 时效检测：仅当短时预报仍在有效窗口内才返回。
    if (content && isForecastCurrent(content, issued)) {
      out.forecast = content
      out.forecastIssuedAt = issued
    }
  }

  if (alarmRes.status === 'fulfilled') {
    const warnings = parseAlarms(alarmRes.value)
    if (warnings.length) out.warnings = warnings
  }

  return out
}

/** 从 panyu_areaAlarm JSON 数组解析生效预警信号。
 *  每项 serial 字段形如「暴雨黄色」，末2字为等级，其余为类型。 */
export function parseAlarms(items: any[]): GzWarning[] {
  if (!Array.isArray(items)) return []
  const warnings: GzWarning[] = []
  const seen = new Set<string>()
  for (const item of items) {
    const serial = typeof item?.serial === 'string' ? item.serial.trim() : ''
    if (serial.length < 3) continue
    const level = serial.slice(-2)
    const type = serial.slice(0, -2)
    if (!type) continue
    const key = type + level
    if (seen.has(key)) continue
    seen.add(key)
    warnings.push({ title: `${type}${level}预警信号`, type, level })
  }
  return warnings
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
  const res = await fetch(`${url}?t=${Math.floor(Date.now() / 60_000)}`, { headers: FETCH_HEADERS })
  if (!res.ok) throw new Error(`数据接口请求失败 HTTP ${res.status}`)
  return extractObject(await res.text(), varName)
}

/** 抓取一个 `try{ var <name> = [...];}catch(e){}` 数据文件并解析成数组。 */
async function fetchArray(url: string, varName: string): Promise<any[]> {
  const res = await fetch(`${url}?t=${Math.floor(Date.now() / 60_000)}`, { headers: FETCH_HEADERS })
  if (!res.ok) throw new Error(`数据接口请求失败 HTTP ${res.status}`)
  return extractArray(await res.text(), varName)
}

/** 映射成统一模型：从 gz_obtAreaRep GDPY 字段取番禺区925站均值。
 *  均值公式：value / z / 10（z = 统计站点数，值为各站×10之和）。 */
function mapAreaData(d: any): GzRealtime {
  const gdpy = d?.GDPY
  if (!gdpy) throw new Error(`数据缺少 GDPY 字段，顶层字段: [${d ? Object.keys(d).join(', ') : d}]`)

  const z = parseFloat(gdpy.z)
  if (isNaN(z) || z <= 0) throw new Error(`GDPY.z 无效: ${gdpy.z}`)

  const mean = (key: string): number | undefined => {
    const n = parseFloat(gdpy[key])
    if (isNaN(n) || n <= -999 * z) return undefined
    return Math.round(n / z / 10)
  }

  const temp = mean('t')
  if (temp == null) throw new Error(`未解析到温度 GDPY.t`)

  const speedMs = mean('wdidf') // m/s
  const deg = mean('wdidd')    // 度

  // ddatetime 为北京时间字符串（如「2026-06-05 15:00」）；
  // 按惯例存为"北京时写入 UTC 字段"，前端按 UTC 渲染即显示正确的北京时间。
  let observedAt: string | undefined
  const ts = typeof gdpy.ddatetime === 'string' ? gdpy.ddatetime : undefined
  if (ts) {
    const dtStr = ts.replace(' ', 'T')
    const withSec = /T\d{2}:\d{2}$/.test(dtStr) ? dtStr + ':00' : dtStr
    observedAt = withSec + '.000Z'
  }

  return {
    temp,
    humidity: mean('rh'),
    windSpeed: speedMs != null ? Math.round(speedMs * 3.6) : undefined, // m/s -> km/h
    windDir: deg != null ? degToDir(deg) : undefined,
    pressure: mean('p'),
    rain1h: mean('hourrf'),
    text: undefined, // 区均值实况无天气现象描述
    observedAt,
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

/** 从 `var <varName> = [ ... ];` 中用括号配对精确截取 JSON 数组（兼容外层 try/catch 包裹）。 */
function extractArray(text: string, varName: string): any[] {
  const anchor = text.indexOf(varName)
  const from = text.indexOf('[', anchor >= 0 ? anchor : 0)
  if (from === -1) throw new Error('未找到数据数组起始 [')

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
    } else if (ch === '[') {
      depth++
    } else if (ch === ']') {
      depth--
      if (depth === 0) {
        const slice = text.slice(from, i + 1)
        try {
          return JSON.parse(slice)
        } catch (e) {
          throw new Error(`数组解析失败：${e instanceof Error ? e.message : String(e)}`)
        }
      }
    }
  }
  throw new Error('括号不配对，未能截取完整数组')
}

function degToDir(deg: number): string {
  const dirs = ['北', '东北', '东', '东南', '南', '西南', '西', '西北']
  return dirs[Math.round(deg / 45) % 8] + '风'
}
