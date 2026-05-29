// Apple WeatherKit 实况抓取（服务端运行：Cloudflare Pages Function + vite 开发插件共用）。
// WeatherKit 用 ES256 JWT 鉴权，私钥(.p8)必须留在服务端，绝不能暴露给浏览器。
// 这里用 Web Crypto（CF Workers 与 Node 18+ 均内置 globalThis.crypto.subtle）做可移植签名。
//
// 需要的环境变量/密钥（在 CF 项目设置或本地 .env 中配置，注意：不要加 VITE_ 前缀，避免泄露到前端）：
//   APPLE_TEAM_ID      Apple 开发者 Team ID（10 位）
//   APPLE_SERVICE_ID   WeatherKit Service ID（如 com.example.weather）
//   APPLE_KEY_ID       密钥 Key ID（10 位）
//   APPLE_PRIVATE_KEY  .p8 私钥内容（PEM，含 BEGIN/END PRIVATE KEY 行；换行可用 \n）

export interface AppleEnv {
  APPLE_TEAM_ID?: string
  APPLE_SERVICE_ID?: string
  APPLE_KEY_ID?: string
  APPLE_PRIVATE_KEY?: string
}

export interface AppleRealtime {
  temp?: number
  feelsLike?: number
  text?: string
  humidity?: number
  windSpeed?: number // km/h
  windDir?: string
  observedAt?: string
}

// WeatherKit conditionCode（英文枚举）-> 中文，挑常见的，未命中回退原值
const CONDITION: Record<string, string> = {
  Clear: '晴', MostlyClear: '晴间多云', PartlyCloudy: '多云', MostlyCloudy: '多云',
  Cloudy: '阴', Haze: '霾', Smoky: '烟雾', Foggy: '雾', Breezy: '微风', Windy: '大风',
  Drizzle: '毛毛雨', Rain: '雨', HeavyRain: '大雨', Showers: '阵雨', ScatteredShowers: '零星阵雨',
  Thunderstorms: '雷暴', Snow: '雪', HeavySnow: '大雪', Flurries: '小雪', Sleet: '雨夹雪',
  Hail: '冰雹', FreezingRain: '冻雨', Hot: '炎热', Frigid: '严寒',
}

export async function fetchAppleCurrent(env: AppleEnv, lat: number, lon: number): Promise<AppleRealtime> {
  if (!env.APPLE_TEAM_ID || !env.APPLE_SERVICE_ID || !env.APPLE_KEY_ID || !env.APPLE_PRIVATE_KEY) {
    throw new Error('未配置 Apple WeatherKit 凭证（APPLE_TEAM_ID/SERVICE_ID/KEY_ID/PRIVATE_KEY）')
  }
  const token = await makeToken(env)
  const url =
    `https://weatherkit.apple.com/api/v1/weather/zh-CN/${lat}/${lon}` +
    `?dataSets=currentWeather&timezone=Asia/Shanghai&country=CN`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`WeatherKit HTTP ${res.status}`)
  const data = await res.json()
  const c = data?.currentWeather
  if (!c) throw new Error('无 currentWeather 数据')
  return {
    temp: round1(c.temperature),
    feelsLike: round1(c.temperatureApparent),
    text: CONDITION[c.conditionCode] ?? c.conditionCode,
    humidity: c.humidity != null ? Math.round(c.humidity * 100) : undefined,
    windSpeed: round1(c.windSpeed), // WeatherKit 单位为 km/h
    windDir: degToDir(c.windDirection),
    observedAt: c.asOf,
  }
}

async function makeToken(env: AppleEnv): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'ES256', kid: env.APPLE_KEY_ID, id: `${env.APPLE_TEAM_ID}.${env.APPLE_SERVICE_ID}`, typ: 'JWT' }
  const payload = { iss: env.APPLE_TEAM_ID, iat: now, exp: now + 3600, sub: env.APPLE_SERVICE_ID }
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`
  const key = await importKey(env.APPLE_PRIVATE_KEY!)
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(input))
  return `${input}.${b64urlBytes(new Uint8Array(sig))}`
}

async function importKey(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '')
  const der = Uint8Array.from(atob(body), (ch) => ch.charCodeAt(0))
  return crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
}

function b64url(s: string): string {
  return b64urlBytes(new TextEncoder().encode(s))
}

function b64urlBytes(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function round1(n: number | undefined): number | undefined {
  return n == null ? undefined : Math.round(n * 10) / 10
}

function degToDir(deg?: number): string | undefined {
  if (deg == null) return undefined
  const dirs = ['北', '东北', '东', '东南', '南', '西南', '西', '西北']
  return dirs[Math.round(deg / 45) % 8] + '风'
}
