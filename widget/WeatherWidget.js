// WeatherWidget.js — Scriptable 天气小组件
// ===========================================
// 使用说明：
// 1. 将此脚本粘贴到 Scriptable App (iOS)
// 2. 修改 CONFIG.apiUrl 指向你部署的 /api/widget 端点
// 3. 长按桌面 → 添加 Scriptable 小组件 → 选择此脚本
// ===========================================

const CONFIG = {
  // Cloudflare Pages 上部署的 widget API 地址
  apiUrl: 'https://weather-8za.pages.dev/api/widget',
  // 城市的 lat/lon 和名称
  cities: [
    { name: '番禺', lat: 22.9468, lon: 113.3622 },
    { name: '安福', lat: 27.3954, lon: 114.6195 },
  ],
  // 默认城市索引 (可在 Scriptable 的 "Widget Parameter" 中覆盖)
  defaultCityIdx: 0,
  // 缓存有效期 (秒)
  cacheTTL: 600,
}

// ── 颜色系统 (Apple 风格深色模式) ──
const C = {
  bg: new Color('#0a0d16'),
  glass: new Color('#1c2333'),
  text: new Color('#f5f5f7'),
  textDim: new Color('#6e6e73'),
  accent: new Color('#0a84ff'),
  hot: new Color('#ff453a'),
  cold: new Color('#40c8e0'),
  warm: new Color('#ff9f0a'),
}

// SF Symbols 天气图标映射
const SYMBOLS = {
  'sun.max.fill': '☀️',
  'sun.min.fill': '🌤️',
  'cloud.sun.fill': '⛅',
  'cloud.fill': '☁️',
  'cloud.fog.fill': '🌫️',
  'cloud.drizzle.fill': '🌦️',
  'cloud.rain.fill': '🌧️',
  'cloud.heavyrain.fill': '🌧️',
  'cloud.snow.fill': '❄️',
  'cloud.bolt.fill': '⛈️',
  'moon.fill': '🌙',
  'cloud.moon.fill': '☁️',
}

// ── 数据处理 ──
let cacheKey = ''
let cacheData = null

async function fetchWeather(lat, lon, name) {
  const key = `${lat},${lon},${name}`
  if (key === cacheKey && cacheData) return cacheData

  const url = `${CONFIG.apiUrl}?lat=${lat}&lon=${lon}&name=${encodeURIComponent(name)}`
  const req = new Request(url)
  req.timeoutInterval = 10
  const res = await req.loadJSON()
  cacheKey = key
  cacheData = res
  return res
}

// ── Gradient Background ──
function createGradient(w, isNight) {
  const gradient = new LinearGradient()
  if (isNight) {
    gradient.colors = [new Color('#0a0d1a'), new Color('#121830'), new Color('#0d1528')]
    gradient.locations = [0, 0.5, 1]
  } else {
    gradient.colors = [new Color('#1a2a4a'), new Color('#162040'), new Color('#0d1426')]
    gradient.locations = [0, 0.6, 1]
  }
  w.backgroundGradient = gradient
}

// ── 温度条 ──
function tempBar(high, low, current) {
  const range = high - low || 1
  const pct = Math.round(((current - low) / range) * 10)
  const chars = ['·','·','·','·','·','·','·','·','·','·','·']
  chars[Math.min(10, Math.max(0, pct))] = '●'
  return `${low}° ${chars.join('')} ${high}°`
}

// ── Small Widget ──
function renderSmall(w, d) {
  const header = w.addStack()
  header.layoutHorizontally()
  header.addSpacer()
  const city = header.addText(d.name)
  city.font = Font.semiboldSystemFont(13)
  city.textColor = C.textDim
  header.addSpacer()

  w.addSpacer(4)

  const iconText = w.addText(d.icon || SYMBOLS[d.daily[0]?.icon] || '☀️')
  iconText.font = Font.systemFont(34)
  iconText.centerAlignText()

  w.addSpacer(2)

  const tempText = w.addText(`${d.temp}°`)
  tempText.font = Font.boldSystemFont(42)
  tempText.textColor = C.text
  tempText.centerAlignText()

  w.addSpacer(2)

  const desc = w.addText(d.text)
  desc.font = Font.mediumSystemFont(14)
  desc.textColor = C.textDim
  desc.centerAlignText()

  w.addSpacer(4)

  const hiLoStack = w.addStack()
  hiLoStack.layoutHorizontally()
  hiLoStack.addSpacer()
  const hi = hiLoStack.addText(`H:${d.high}°`)
  hi.font = Font.semiboldSystemFont(12)
  hi.textColor = C.hot
  hiLoStack.addSpacer(8)
  const lo = hiLoStack.addText(`L:${d.low}°`)
  lo.font = Font.semiboldSystemFont(12)
  lo.textColor = C.cold
  hiLoStack.addSpacer()
}

// ── Medium Widget ──
function renderMedium(w, d) {
  // 主区域：左侧大温度 + 右侧预报
  const main = w.addStack()
  main.layoutHorizontally()

  // 左侧
  const left = main.addStack()
  left.layoutVertically()
  left.setPadding(0, 0, 0, 0)

  const city = left.addText(d.name)
  city.font = Font.semiboldSystemFont(14)
  city.textColor = C.textDim

  left.addSpacer(4)

  const icon = left.addText(d.icon || SYMBOLS[d.daily[0]?.icon] || '☀️')
  icon.font = Font.systemFont(30)

  left.addSpacer(2)

  const tempStack = left.addStack()
  tempStack.layoutHorizontally()
  tempStack.bottomAlignContent()
  const temp = tempStack.addText(`${d.temp}`)
  temp.font = Font.boldSystemFont(54)
  temp.textColor = C.text
  const degree = tempStack.addText('°')
  degree.font = Font.boldSystemFont(24)
  degree.textColor = C.textDim

  left.addSpacer(2)

  const desc = left.addText(d.text)
  desc.font = Font.mediumSystemFont(15)
  desc.textColor = C.textDim

  left.addSpacer(6)

  const hiLo = left.addText(`H:${d.high}°  L:${d.low}°`)
  hiLo.font = Font.semiboldSystemFont(13)
  hiLo.textColor = C.text

  // 右侧：逐时预报
  main.addSpacer()

  const right = main.addStack()
  right.layoutVertically()
  right.setPadding(0, 0, 0, 0)

  const hLabel = right.addText('逐时')
  hLabel.font = Font.semiboldSystemFont(11)
  hLabel.textColor = C.textDim
  right.addSpacer(4)

  const hours = d.hourly.slice(0, 5)
  for (const h of hours) {
    const row = right.addStack()
    row.layoutHorizontally()
    row.spacing = 4

    const t = row.addText(h.time)
    t.font = Font.regularSystemFont(12)
    t.textColor = C.textDim
    t.lineLimit = 1

    const i = row.addText(SYMBOLS[h.icon] || '☀️')
    i.font = Font.systemFont(12)

    const tmp = row.addText(`${h.temp}°`)
    tmp.font = Font.semiboldSystemFont(13)
    tmp.textColor = C.text
    tmp.lineLimit = 1

    right.addSpacer(2)
  }
}

// ── Large Widget ──
function renderLarge(w, d) {
  // Header: city + time
  const header = w.addStack()
  header.layoutHorizontally()
  const city = header.addText(d.name)
  city.font = Font.semiboldSystemFont(16)
  city.textColor = C.textDim
  header.addSpacer()

  const now = new Date()
  const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  const timeT = header.addText(timeStr)
  timeT.font = Font.regularSystemFont(14)
  timeT.textColor = C.textDim

  w.addSpacer(8)

  // Hero: icon + temp + description
  const hero = w.addStack()
  hero.layoutHorizontally()
  hero.bottomAlignContent()

  const heroLeft = hero.addStack()
  heroLeft.layoutVertically()

  const icon = heroLeft.addText(d.icon || SYMBOLS[d.daily[0]?.icon] || '☀️')
  icon.font = Font.systemFont(44)

  heroLeft.addSpacer(4)

  const desc = heroLeft.addText(d.text)
  desc.font = Font.mediumSystemFont(17)
  desc.textColor = C.text

  hero.addSpacer()

  const temp = hero.addText(`${d.temp}°`)
  temp.font = Font.boldSystemFont(72)
  temp.textColor = C.text
  temp.lineLimit = 1

  w.addSpacer(4)

  // info row
  const info = w.addStack()
  info.layoutHorizontally()
  info.spacing = 12

  const hiInfo = info.addText(`最高 ${d.high}°`)
  hiInfo.font = Font.semiboldSystemFont(13)
  hiInfo.textColor = C.hot
  const loInfo = info.addText(`最低 ${d.low}°`)
  loInfo.font = Font.semiboldSystemFont(13)
  loInfo.textColor = C.cold
  const feel = info.addText(`体感 ${d.feelsLike}°`)
  feel.font = Font.regularSystemFont(13)
  feel.textColor = C.textDim

  w.addSpacer(4)

  // detail row
  const detail = w.addStack()
  detail.layoutHorizontally()
  detail.spacing = 16
  const hum = detail.addText(`湿度 ${d.humidity}%`)
  hum.font = Font.regularSystemFont(13)
  hum.textColor = C.textDim
  const wind = detail.addText(`${d.windDir} ${d.windSpeed}km/h`)
  wind.font = Font.regularSystemFont(13)
  wind.textColor = C.textDim
  const sun = detail.addText(`日出 ${d.sunrise} 日落 ${d.sunset}`)
  sun.font = Font.regularSystemFont(13)
  sun.textColor = C.textDim

  w.addSpacer(10)

  // Divider
  const div = w.addStack()
  div.size = new Size(0, 0.5)
  div.backgroundColor = new Color('#ffffff', 0.1)
  w.addSpacer(6)

  // Hourly forecast
  const hTitle = w.addText('逐时预报')
  hTitle.font = Font.semiboldSystemFont(12)
  hTitle.textColor = C.textDim
  w.addSpacer(4)

  const hourlyRow = w.addStack()
  hourlyRow.layoutHorizontally()
  hourlyRow.spacing = 8
  for (const h of d.hourly) {
    const col = hourlyRow.addStack()
    col.layoutVertically()
    col.spacing = 4

    const t = col.addText(h.time)
    t.font = Font.regularSystemFont(11)
    t.textColor = C.textDim
    t.centerAlignText()

    const ic = col.addText(SYMBOLS[h.icon] || '☀️')
    ic.font = Font.systemFont(16)
    ic.centerAlignText()

    const tmp = col.addText(`${h.temp}°`)
    tmp.font = Font.semiboldSystemFont(13)
    tmp.textColor = C.text
    tmp.centerAlignText()
  }

  w.addSpacer(8)

  // 3-day forecast
  const dTitle = w.addText('未来天气')
  dTitle.font = Font.semiboldSystemFont(12)
  dTitle.textColor = C.textDim
  w.addSpacer(4)

  for (const day of d.daily) {
    const row = w.addStack()
    row.layoutHorizontally()
    row.spacing = 8

    const dayLabel = row.addText(day.day)
    dayLabel.font = Font.semiboldSystemFont(14)
    dayLabel.textColor = C.text
    dayLabel.lineLimit = 1

    const dayIcon = row.addText(SYMBOLS[day.icon] || '☀️')
    dayIcon.font = Font.systemFont(14)

    const dayDesc = row.addText(day.text)
    dayDesc.font = Font.regularSystemFont(13)
    dayDesc.textColor = C.textDim
    dayDesc.lineLimit = 1

    row.addSpacer()

    const bar = tempBar(day.high, day.low, (day.high + day.low) / 2)
    const barText = row.addText(bar)
    barText.font = Font.regularSystemFont(9)
    barText.textColor = C.textDim
    barText.lineLimit = 1

    const dayHi = row.addText(`${day.high}°`)
    dayHi.font = Font.semiboldSystemFont(13)
    dayHi.textColor = C.text
    const dayLo = row.addText(`${day.low}°`)
    dayLo.font = Font.semiboldSystemFont(13)
    dayLo.textColor = C.textDim

    w.addSpacer(3)
  }

  w.addSpacer(6)

  // Footer
  const footer = w.addStack()
  footer.layoutHorizontally()
  footer.addSpacer()
  const upd = footer.addText(`更新于 ${d.updatedAt ? new Date(d.updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '—'}`)
  upd.font = Font.regularSystemFont(9)
  upd.textColor = C.textDim
  upd.centerAlignText()
  footer.addSpacer()
}

// ── Main ──
async function run() {
  const widget = (config.runsInWidget ? args.widgetParameter : null) ?? String(CONFIG.defaultCityIdx)
  let city

  // 解析 widget parameter: 可以是城市名称 或 索引
  if (widget) {
    const idx = parseInt(widget)
    if (!isNaN(idx) && CONFIG.cities[idx]) {
      city = CONFIG.cities[idx]
    } else {
      city = CONFIG.cities.find(c => c.name === widget)
    }
  }
  if (!city) city = CONFIG.cities[CONFIG.defaultCityIdx]

  // 如果不在 widget 模式（在 app 内运行），先展示预览
  if (!config.runsInWidget) {
    const list = new ListWidget()
    list.addText('天气实况 Widget 预览中...')
    list.addText(`${city.name} · ${CONFIG.apiUrl}`)
    list.presentSmall()
  }

  // 创建 Widget
  const w = new ListWidget()

  try {
    const data = await fetchWeather(city.lat, city.lon, city.name)
    const now = new Date()
    const hour = now.getHours()
    const isNight = hour < 6 || hour >= 20

    createGradient(w, isNight)
    w.setPadding(16, 16, 14, 16)

    if (config.widgetFamily === 'small') {
      renderSmall(w, data)
    } else if (config.widgetFamily === 'medium') {
      renderMedium(w, data)
    } else {
      renderLarge(w, data)
    }
  } catch (e) {
    w.backgroundColor = C.bg
    const err = w.addText('无法加载天气')
    err.font = Font.mediumSystemFont(14)
    err.textColor = C.textDim
    err.centerAlignText()
    w.addSpacer(4)
    const msg = w.addText(e.message || '未知错误')
    msg.font = Font.regularSystemFont(11)
    msg.textColor = C.textDim
    msg.centerAlignText()
  }

  if (config.runsInWidget) {
    Script.setWidget(w)
  } else {
    w.presentMedium()
  }
  Script.complete()
}

await run()
