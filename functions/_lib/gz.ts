// 广州市气象局·番禺 实况抓取（服务端运行：Cloudflare Pages Function + vite 开发插件共用）。
//
// ⚠️ 重要：页面 http://www.tqyb.com.cn/gzpanyu/ 的实况数值（温度/湿度/风/雨量/气压）
//    并不在静态 HTML 里——HTML 中是 "--" 占位符，数据是页面加载后由 JS
//    （require.js 模块 gzshi_obtAreaRep，区域代码 GDPY）通过 XHR 从 /data/ 下的
//    接口异步拉取并填充的。因此必须直接请求那个底层数据接口，而不是抓 HTML。
//
//    待办：用浏览器打开该页面 → F12 → Network → 筛选 XHR/Fetch，找到能让
//    「番禺代表站」温度出现的那个请求（多半在 http://www.tqyb.com.cn/data/ 下，
//    返回 JSON），把它的完整 URL 填到 GZ_DATA_URL，并据其返回结构调整 mapData()。

const AREA_CODE = 'GDPY' // 番禺区
const ORIGIN = 'http://www.tqyb.com.cn'

// TODO: 填入真实的实况数据接口 URL（从 Network 面板获取）。例如：
//   `${ORIGIN}/data/gzobts/REP_${AREA_CODE}.json`
const GZ_DATA_URL = ''

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
  if (!GZ_DATA_URL) {
    throw new Error(
      '广州源待配置：该页面实况由 JS 异步加载，需在 functions/_lib/gz.ts 填入真实数据接口 URL（见文件注释）',
    )
  }
  const res = await fetch(GZ_DATA_URL, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      Referer: `${ORIGIN}/gzpanyu/`,
      'X-Requested-With': 'XMLHttpRequest',
    },
  })
  if (!res.ok) throw new Error(`数据接口请求失败 HTTP ${res.status}`)

  // 有些站点返回 JSONP 或前缀，做一次宽松解析
  const text = await res.text()
  const data = parseLoose(text)
  return mapData(data)
}

/** 把数据接口返回的 JSON 映射成统一模型。拿到真实返回结构后据此调整字段名。 */
function mapData(d: any): GzRealtime {
  // 占位映射：字段名需按真实接口调整。下面用「多候选取值」尽量兼容常见命名。
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = getDeep(d, k)
      if (v != null && v !== '') return v
    }
    return undefined
  }
  const num = (v: any) => {
    const n = parseFloat(v)
    return isNaN(n) ? undefined : n
  }
  const speed = num(pick('windSpeed', 'wind_speed', 'fs', 'WS', 'speed'))
  return {
    temp: num(pick('temp', 'temperature', 'wd', 'T', 'tmp')),
    humidity: num(pick('humidity', 'rh', 'sd', 'RH')),
    text: pick('weather', 'wp', 'text', 'tq'),
    windDir: pick('windDir', 'wind_dir', 'fx', 'WD'),
    windSpeed: speed != null ? Math.round(speed * 3.6 * 10) / 10 : undefined, // 若原单位 m/s 转 km/h
    pressure: num(pick('pressure', 'qy', 'P', 'pa')),
    rain1h: num(pick('rain', 'rain1h', 'jyl', 'R')),
    observedAt: pick('time', 'obsTime', 'sj', 'datetime', 'updatetime'),
  }
}

function parseLoose(text: string): any {
  try {
    return JSON.parse(text)
  } catch {
    // 去掉可能的 JSONP 包裹：callback({...})
    const m = text.match(/^[^({]*\(([\s\S]*)\)\s*;?\s*$/)
    if (m) {
      try {
        return JSON.parse(m[1])
      } catch {
        /* fallthrough */
      }
    }
    throw new Error('数据接口返回非 JSON，需调整解析')
  }
}

function getDeep(obj: any, path: string): any {
  // 支持 "a.b.c" 路径，也支持顶层 key
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj)
}
