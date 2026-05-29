// 广州市气象局·番禺 实况抓取（服务端运行：Cloudflare Pages Function + vite 开发插件共用）。
//
// 数据来源：http://www.tqyb.com.cn/data/latestWeather/gz_latestWeather.js
// 这是番禺页面 JS（require.js 模块 gzshi_obtAreaRep）异步加载的全市最新实况数据文件，
// 按区代码索引（番禺 = GDPY）。文件是 .js（可能为 `var x = {...};` 或 JSONP），需宽松解析。

const AREA_CODE = 'GDPY' // 番禺区
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
  const data = parseLoose(text)
  const area = extractArea(data)
  if (!area) throw new Error(`未在数据中找到番禺(${AREA_CODE})`)
  return mapData(area)
}

/** 从全市数据里取出番禺那条 */
function extractArea(data: any): any {
  if (data == null) return null
  // 1) 对象按区代码索引：{ GDPY: {...} }
  if (typeof data === 'object' && !Array.isArray(data)) {
    if (data[AREA_CODE]) return data[AREA_CODE]
    // 有些把数据放在 data/result/list 等字段下
    for (const wrap of ['data', 'result', 'list', 'stations', 'areas']) {
      if (data[wrap]) {
        const inner = extractArea(data[wrap])
        if (inner) return inner
      }
    }
  }
  // 2) 数组：找 code/area 等于 GDPY，或名称含「番禺」的项
  if (Array.isArray(data)) {
    return (
      data.find((it) => it && (it.code === AREA_CODE || it.area === AREA_CODE || it.areacode === AREA_CODE)) ??
      data.find((it) => it && typeof it.name === 'string' && it.name.includes('番禺')) ??
      null
    )
  }
  return null
}

/** 映射成统一模型。字段名用多候选兼容；若取不到温度，抛出含真实字段名的诊断错误。 */
function mapData(d: any): GzRealtime {
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = d?.[k]
      if (v != null && v !== '' && v !== '--') return v
    }
    return undefined
  }
  const num = (v: any) => {
    const n = parseFloat(v)
    return isNaN(n) ? undefined : n
  }

  const temp = num(pick('temp', 'temperature', 'wd', 'T', 'tmp', 'airtemp', 'AirTemp'))
  if (temp == null) {
    // 诊断：把真实字段名带出来，方便精确映射
    const keys = d && typeof d === 'object' ? Object.keys(d).join(', ') : String(d)
    throw new Error(`未解析到温度，番禺数据字段为: [${keys}]`)
  }

  const speed = num(pick('windSpeed', 'wind_speed', 'fs', 'WS', 'speed', 'windspeed'))
  return {
    temp,
    humidity: num(pick('humidity', 'rh', 'sd', 'RH', 'humi')),
    text: pick('weather', 'wp', 'text', 'tq', 'weatherinfo'),
    windDir: pick('windDir', 'wind_dir', 'fx', 'WD', 'winddirection'),
    windSpeed: speed != null ? Math.round(speed * 3.6 * 10) / 10 : undefined, // 若原单位 m/s 转 km/h
    pressure: num(pick('pressure', 'qy', 'P', 'pa', 'airpressure')),
    rain1h: num(pick('rain', 'rain1h', 'jyl', 'R', 'rainfall')),
    observedAt: pick('time', 'obsTime', 'sj', 'datetime', 'updatetime', 'ptime'),
  }
}

function parseLoose(text: string): any {
  const t = text.trim()
  try {
    return JSON.parse(t)
  } catch {
    /* 继续尝试 */
  }
  // var x = {...};  或  callback({...})  ——抽取第一段 {...} / [...]
  const start = t.search(/[[{]/)
  const endObj = t.lastIndexOf('}')
  const endArr = t.lastIndexOf(']')
  const end = Math.max(endObj, endArr)
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(t.slice(start, end + 1))
    } catch {
      /* fallthrough */
    }
  }
  throw new Error('数据文件非标准 JSON，需调整解析')
}
