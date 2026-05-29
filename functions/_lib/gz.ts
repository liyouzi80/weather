// 广州市气象局 实况抓取（服务端运行：Cloudflare Pages Function + vite 开发插件共用）。
//
// 数据来源：http://www.tqyb.com.cn/data/latestWeather/gz_latestWeather.js
// 文件形如：  try{ var gz_latestWeather = { ... };}catch(e){}
// 实况在 baseObtInfo（广州国家基本站 59287），字段为数值；gzObtInfo 为备用站。
//
// 注意：
//  - 文件为 GBK 编码，中文会乱码；但本模块只取数值字段（温度/湿度/风/时间/雨量），
//    风向由度数自行转中文，故不受编码影响。
//  - 外层有 try{...}catch 包裹，需用括号配对精确截取对象，不能简单取首尾大括号。
//  - 该站为广州基本站（市区），与番禺有十余公里距离；若需番禺本地站，
//    可用同样方式找 panyu 对应的数据文件并替换 GZ_DATA_URL 与字段。

const ORIGIN = 'http://www.tqyb.com.cn'
const GZ_DATA_URL = `${ORIGIN}/data/latestWeather/gz_latestWeather.js`

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
}

export async function scrapeGuangzhou(): Promise<GzRealtime> {
  const res = await fetch(`${GZ_DATA_URL}?random=${Math.random()}`, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      Referer: `${ORIGIN}/gzpanyu/`,
      'X-Requested-With': 'XMLHttpRequest',
    },
  })
  if (!res.ok) throw new Error(`数据接口请求失败 HTTP ${res.status}`)
  const text = await res.text()
  const data = extractObject(text)
  return mapData(data)
}

/** 映射成统一模型：取 baseObtInfo（广州基本站），备用 gzObtInfo。 */
function mapData(d: any): GzRealtime {
  const obt = d?.baseObtInfo ?? d?.gzObtInfo
  if (!obt) throw new Error(`数据缺少 baseObtInfo，顶层字段: [${d ? Object.keys(d).join(', ') : d}]`)

  // -999.9 等为缺测哨兵
  const clean = (v: any) => {
    const n = parseFloat(v)
    return isNaN(n) || n <= -999 ? undefined : n
  }

  const temp = clean(obt.temp)
  if (temp == null) throw new Error(`未解析到温度，baseObtInfo 字段: [${Object.keys(obt).join(', ')}]`)

  const speed = clean(obt.wd2ds) // m/s
  const deg = clean(obt.wd2dd) // 度
  const ts = d.baseObtDate ?? d.gzObtDate

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

/** 从 `... = { ... };` 中用括号配对精确截取 JSON 对象（兼容外层 try/catch 包裹与字符串内的括号）。 */
function extractObject(text: string): any {
  const anchor = text.indexOf('gz_latestWeather')
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
