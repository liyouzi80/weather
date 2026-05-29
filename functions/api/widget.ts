// Cloudflare Pages Function: /api/widget
// 返回简化的天气 JSON，供 Scriptable widget 使用
//
// Query params:
//   lat, lon — 经纬度（可选，默认番禺）
//   name    — 城市展示名（可选）

interface WidgetData {
  name: string
  temp: number
  feelsLike: number
  text: string
  icon: string
  humidity: number
  windSpeed: number
  windDir: string
  high: number
  low: number
  updatedAt: string
  sunrise: string
  sunset: string
  hourly: { time: string; temp: number; icon: string }[]
  daily: { day: string; high: number; low: number; icon: string; text: string }[]
}

// Open-Meteo 天气代码 → 中文描述
const WEATHER_CODES: Record<number, string> = {
  0: '晴', 1: '大部晴', 2: '多云', 3: '阴',
  45: '雾', 48: '雾凇',
  51: '小毛毛雨', 53: '毛毛雨', 55: '大毛毛雨',
  61: '小雨', 63: '中雨', 65: '大雨',
  71: '小雪', 73: '中雪', 75: '大雪',
  80: '阵雨', 81: '中阵雨', 82: '大阵雨',
  85: '小阵雪', 86: '大阵雪',
  95: '雷暴', 96: '冰雹雷暴', 99: '大冰雹雷暴',
}

function weatherText(code: number): string {
  return WEATHER_CODES[code] ?? '—'
}

function weatherIcon(code: number): string {
  if (code === 0) return 'sun.max.fill'
  if (code <= 1) return 'sun.min.fill'
  if (code <= 2) return 'cloud.sun.fill'
  if (code === 3) return 'cloud.fill'
  if (code <= 48) return 'cloud.fog.fill'
  if (code <= 55) return 'cloud.drizzle.fill'
  if (code <= 65) return 'cloud.rain.fill'
  if (code <= 75) return 'cloud.snow.fill'
  if (code <= 82) return 'cloud.heavyrain.fill'
  if (code <= 86) return 'cloud.snow.fill'
  return 'cloud.bolt.fill'
}

function windDirection(deg: number): string {
  const dirs = ['北', '东北', '东', '东南', '南', '西南', '西', '西北']
  return dirs[Math.round(deg / 45) % 8]
}

export const onRequest = async ({ request }: { request: Request }): Promise<Response> => {
  const url = new URL(request.url)
  const lat = parseFloat(url.searchParams.get('lat') ?? '22.9468')
  const lon = parseFloat(url.searchParams.get('lon') ?? '113.3622')
  const name = url.searchParams.get('name') ?? '番禺'

  try {
    const params = new URLSearchParams({
      latitude: lat.toString(),
      longitude: lon.toString(),
      current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m',
      hourly: 'temperature_2m,weather_code',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min',
      timezone: 'Asia/Shanghai',
      forecast_days: '3',
    })

    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`)
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}`)

    const data = await res.json()
    const current = data.current
    const daily = data.daily
    const hourly = data.hourly

    // 获取当天的日出日落
    const today = new Date()
    const dateStr = today.toISOString().split('T')[0]
    const sunParams = new URLSearchParams({
      latitude: lat.toString(),
      longitude: lon.toString(),
      date: dateStr,
      timezone: 'Asia/Shanghai',
    })
    let sunrise = '06:00'
    let sunset = '18:00'
    try {
      const sunRes = await fetch(`https://api.sunrise-sunset.org/json?${sunParams}&formatted=0`)
      if (sunRes.ok) {
        const sunData = await sunRes.json()
        if (sunData.status === 'OK') {
          sunrise = new Date(sunData.results.sunrise).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
          sunset = new Date(sunData.results.sunset).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
        }
      }
    } catch { /* fallback */ }

    // 当前小时索引
    const now = new Date()
    const currentHour = now.getHours()

    // 未来 6 小时
    const hourlySlice = hourly.time
      .map((t: string, i: number) => ({
        time: new Date(t).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
        temp: Math.round(hourly.temperature_2m[i]),
        icon: weatherIcon(hourly.weather_code[i]),
      }))
      .slice(currentHour, currentHour + 6)

    // 3 天预报
    const dailySlice = daily.time.map((t: string, i: number) => ({
      day: new Date(t).toLocaleDateString('zh-CN', { weekday: 'short' }),
      high: Math.round(daily.temperature_2m_max[i]),
      low: Math.round(daily.temperature_2m_min[i]),
      icon: weatherIcon(daily.weather_code[i]),
      text: weatherText(daily.weather_code[i]),
    }))

    const result: WidgetData = {
      name,
      temp: Math.round(current.temperature_2m),
      feelsLike: Math.round(current.apparent_temperature),
      text: weatherText(current.weather_code),
      icon: weatherIcon(current.weather_code),
      humidity: current.relative_humidity_2m,
      windSpeed: Math.round(current.wind_speed_10m),
      windDir: windDirection(current.wind_direction_10m),
      high: Math.round(daily.temperature_2m_max[0]),
      low: Math.round(daily.temperature_2m_min[0]),
      updatedAt: now.toISOString(),
      sunrise,
      sunset,
      hourly: hourlySlice,
      daily: dailySlice,
    }

    return new Response(JSON.stringify(result), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'access-control-allow-origin': '*',
        'cache-control': 'public, max-age=600',
      },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 502,
      headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' },
    })
  }
}
