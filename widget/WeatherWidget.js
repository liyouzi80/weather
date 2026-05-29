// WeatherWidget.js — 多信源天气实况对比 Widget
// ===============================================
// 使用说明：
// 1. 将此脚本粘贴到 Scriptable App (iOS)
// 2. 长按桌面 → 添加 Scriptable 小组件 → 选择此脚本
// 3. Widget Parameter 可填城市名（番禺/安福）或索引（0/1）
// ===============================================

const CONFIG = {
  apiUrl: 'https://weather-8za.pages.dev/api/widget',
  cities: [
    { name: '番禺', lat: 22.9468, lon: 113.3622, cityName: '番禺' },
    { name: '安福', lat: 27.3954, lon: 114.6195, cityName: '安福' },
  ],
  defaultCityIdx: 0,
  cacheTTL: 600,
}

// ── 颜色 ──
const C = {
  bg: new Color('#0a0d16'),
  text: new Color('#f5f5f7'),
  textDim: new Color('#6e6e73'),
  textSecondary: new Color('#98989d'),
  hot: new Color('#ff453a'),
  cold: new Color('#40c8e0'),
  accent: new Color('#0a84ff'),
}

// 信源颜色（与 web app 一致）
const PROVIDER_COLORS = {
  'open-meteo': '#22c55e',
  'nmc': '#ef4444',
  'gzqx': '#a855f7',
  'qweather': '#3b82f6',
  'caiyun': '#f59e0b',
  'owm': '#f97316',
  'weatherapi': '#0ea5e9',
}

// ── 数据获取 ──
let cacheKey = ''
let cacheData = null

async function fetchData(lat, lon, name, cityName) {
  const key = `${lat},${lon},${name}`
  if (key === cacheKey && cacheData) return cacheData
  const params = `lat=${lat}&lon=${lon}&name=${encodeURIComponent(name)}&cityName=${encodeURIComponent(cityName)}`
  const req = new Request(`${CONFIG.apiUrl}?${params}`)
  req.timeoutInterval = 15
  const res = await req.loadJSON()
  cacheKey = key
  cacheData = res
  return res
}

// ── 渐变背景 ──
function setBackground(w) {
  const gradient = new LinearGradient()
  gradient.colors = [new Color('#0a0d1a'), new Color('#121830'), new Color('#0d1528')]
  gradient.locations = [0, 0.5, 1]
  w.backgroundGradient = gradient
}

// ── 渲染：城市标题行 ──
function renderHeader(w, city, text, count, total) {
  const header = w.addStack()
  header.layoutHorizontally()
  header.centerAlignContent()

  const cityLabel = header.addText(city)
  cityLabel.font = Font.semiboldSystemFont(16)
  cityLabel.textColor = C.text

  header.addSpacer(4)

  if (text) {
    const textLabel = header.addText(text)
    textLabel.font = Font.mediumSystemFont(14)
    textLabel.textColor = C.textSecondary
  }

  header.addSpacer()

  const countLabel = header.addText(`${count}/${total}`)
  countLabel.font = Font.regularSystemFont(11)
  countLabel.textColor = C.textDim
}

// ── 渲染：中位温度 ──
function renderMedian(w, median) {
  if (median == null) return
  const row = w.addStack()
  row.layoutHorizontally()
  row.addSpacer()
  const label = row.addText(`中位 ${median.toFixed(1)}°`)
  label.font = Font.mediumSystemFont(12)
  label.textColor = C.textDim
  row.addSpacer()
}

// ── 渲染：信源列表 ──
function renderProviders(w, providers, max, min) {
  for (const p of providers) {
    w.addSpacer(4)
    const row = w.addStack()
    row.layoutHorizontally()
    row.centerAlignContent()

    // 彩色圆点
    const colorHex = PROVIDER_COLORS[p.id] || p.color || '#6e6e73'
    const dot = row.addText('●')
    dot.font = Font.regularSystemFont(9)
    dot.textColor = new Color(colorHex)
    dot.lineLimit = 1

    row.addSpacer(6)

    // 名称
    const name = row.addText(p.name)
    name.font = Font.mediumSystemFont(14)
    name.textColor = p.error ? C.textDim : C.text
    name.lineLimit = 1

    row.addSpacer()

    // 温度或错误
    if (p.error) {
      const err = row.addText('—')
      err.font = Font.regularSystemFont(14)
      err.textColor = C.textDim
    } else {
      const temp = row.addText(`${p.temp}°`)
      temp.font = Font.semiboldSystemFont(16)
      if (p.temp === max && max !== min) {
        temp.textColor = C.hot
      } else if (p.temp === min && max !== min) {
        temp.textColor = C.cold
      } else {
        temp.textColor = C.text
      }
      temp.lineLimit = 1
    }
  }
}

// ── 渲染：底部更新时间 ──
function renderFooter(w, updatedAt) {
  w.addSpacer()
  const footer = w.addStack()
  footer.layoutHorizontally()
  footer.addSpacer()
  const time = updatedAt
    ? new Date(updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    : '—'
  const label = footer.addText(`更新 ${time}`)
  label.font = Font.regularSystemFont(9)
  label.textColor = C.textDim
  footer.addSpacer()
}

// ── 渲染：错误状态 ──
function renderError(w, msg) {
  const err = w.addText('加载失败')
  err.font = Font.mediumSystemFont(15)
  err.textColor = C.textDim
  err.centerAlignText()
  w.addSpacer(4)
  const detail = w.addText(msg)
  detail.font = Font.regularSystemFont(11)
  detail.textColor = C.textDim
  detail.centerAlignText()
}

// ── 渲染 Widget ──
function renderWidget(w, data) {
  setBackground(w)
  w.setPadding(16, 16, 14, 16)

  renderHeader(w, data.city, data.text, data.count, data.total)
  w.addSpacer(10)
  renderProviders(w, data.providers, data.max, data.min)
  w.addSpacer(6)
  renderMedian(w, data.median)
  renderFooter(w, data.updatedAt)
}

// ── Main ──
async function run() {
  // 解析城市
  const param = config.runsInWidget ? args.widgetParameter : null
  let city
  if (param) {
    const idx = parseInt(param)
    if (!isNaN(idx) && CONFIG.cities[idx]) {
      city = CONFIG.cities[idx]
    } else {
      city = CONFIG.cities.find(c => c.name === param || c.cityName === param)
    }
  }
  if (!city) city = CONFIG.cities[CONFIG.defaultCityIdx]

  // 在 app 内运行时显示预览
  if (!config.runsInWidget) {
    const preview = new ListWidget()
    preview.addText(`${city.name} · 多信源对比`)
    preview.addText(CONFIG.apiUrl)
    preview.presentSmall()
  }

  const w = new ListWidget()

  try {
    const data = await fetchData(city.lat, city.lon, city.name, city.cityName)
    renderWidget(w, data)
  } catch (e) {
    w.backgroundColor = C.bg
    renderError(w, e.message || '未知错误')
  }

  if (config.runsInWidget) {
    Script.setWidget(w)
  } else {
    w.presentMedium()
  }
  Script.complete()
}

await run()
