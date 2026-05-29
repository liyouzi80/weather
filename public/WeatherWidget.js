// WeatherWidget.js — 多信源天气实况（与首页概览卡片一致）
// 地名 + 天气 + 平均气温 + 最高/最低，简洁明了。
// ===============================================

const CONFIG = {
  apiUrl: 'https://weather-8za.pages.dev/api/widget',
  cities: [
    { name: '番禺区', lat: 22.9468, lon: 113.3622, cityName: '番禺' },
    { name: '安福县', lat: 27.3954, lon: 114.6195, cityName: '安福' },
  ],
  defaultCityIdx: 0,
}

const C = {
  text:  new Color('#f5f5f7'),
  text2: new Color('#98989d'),
  dim:   new Color('#6e6e73'),
  hot:   new Color('#ff453a'),
  cold:  new Color('#40c8e0'),
}

// ── 数据 ──
let _k = '', _d = null
async function fetchData(lat, lon, name, cityName) {
  const key = `${lat},${lon},${name}`
  if (key === _k && _d) return _d
  const p = `lat=${lat}&lon=${lon}&name=${encodeURIComponent(name)}&cityName=${encodeURIComponent(cityName)}`
  const req = new Request(`${CONFIG.apiUrl}?${p}`)
  req.timeoutInterval = 15
  _d = await req.loadJSON()
  _k = key
  return _d
}

// ── 背景 ──
function bg(w) {
  const g = new LinearGradient()
  g.colors = [new Color('#0b1426'), new Color('#080d18'), new Color('#05080f')]
  g.locations = [0, 0.55, 1]
  w.backgroundGradient = g
}

// 天气文字 → 彩色 emoji
function weatherEmoji(text) {
  if (!text) return '☁️'
  if (/雷/.test(text)) return '⛈️'
  if (/雪/.test(text)) return '🌨️'
  if (/雨/.test(text)) return '🌧️'
  if (/雾|霾|沙|尘/.test(text)) return '🌫️'
  if (/阴/.test(text)) return '☁️'
  if (/多云|间/.test(text)) return '⛅️'
  if (/晴/.test(text)) return '☀️'
  return '☁️'
}

// 平均气温字符串（首页大数字用平均值，缺则退中位数）
function avgStr(data) {
  const v = data.avg != null ? data.avg : data.median
  return v != null ? `${Number(v).toFixed(1)}°` : '—'
}
function clock(data) {
  return data.updatedAt
    ? new Date(data.updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    : '—'
}

// 一组「标签 值°」
function addHL(parent, label, val, color, labelSize, valSize) {
  const s = parent.addStack()
  s.layoutHorizontally()
  s.centerAlignContent()
  const l = s.addText(label + ' ')
  l.font = Font.systemFont(labelSize)
  l.textColor = C.dim
  const v = s.addText(val != null ? `${Math.round(val)}°` : '—')
  v.font = Font.semiboldSystemFont(valSize)
  v.textColor = color
}

// ── 中号 / 大号 ──
function renderMain(w, data) {
  bg(w)
  w.setPadding(18, 20, 16, 20)
  w.addSpacer()

  const city = w.addText(data.city)
  city.font = Font.semiboldSystemFont(18)
  city.textColor = C.text2
  city.centerAlignText()

  w.addSpacer(6)

  if (data.text) {
    const e = w.addText(weatherEmoji(data.text))
    e.font = Font.systemFont(40)
    e.centerAlignText()
    w.addSpacer(2)
  }

  const big = w.addText(avgStr(data))
  big.font = Font.boldSystemFont(56)
  big.textColor = C.text
  big.centerAlignText()
  big.minimumScaleFactor = 0.6

  w.addSpacer(10)

  const hilo = w.addStack()
  hilo.layoutHorizontally()
  hilo.centerAlignContent()
  hilo.addSpacer()
  addHL(hilo, '最高', data.max, C.hot, 14, 16)
  hilo.addSpacer(22)
  addHL(hilo, '最低', data.min, C.cold, 14, 16)
  hilo.addSpacer()

  w.addSpacer()

  const ft = w.addText(`更新 ${clock(data)}`)
  ft.font = Font.regularSystemFont(10)
  ft.textColor = C.dim
  ft.centerAlignText()
}

// ── 小号 ──
function renderSmall(w, data) {
  bg(w)
  w.setPadding(14, 14, 12, 14)
  w.addSpacer()

  const city = w.addText(data.city)
  city.font = Font.semiboldSystemFont(14)
  city.textColor = C.text2
  city.centerAlignText()

  w.addSpacer(4)

  if (data.text) {
    const e = w.addText(weatherEmoji(data.text))
    e.font = Font.systemFont(28)
    e.centerAlignText()
    w.addSpacer(2)
  }

  const big = w.addText(avgStr(data))
  big.font = Font.boldSystemFont(42)
  big.textColor = C.text
  big.centerAlignText()
  big.minimumScaleFactor = 0.6

  w.addSpacer(8)

  const hilo = w.addStack()
  hilo.layoutHorizontally()
  hilo.centerAlignContent()
  hilo.addSpacer()
  addHL(hilo, '高', data.max, C.hot, 11, 12)
  hilo.addSpacer(12)
  addHL(hilo, '低', data.min, C.cold, 11, 12)
  hilo.addSpacer()

  w.addSpacer()

  const ft = w.addText(`更新 ${clock(data)}`)
  ft.font = Font.regularSystemFont(9)
  ft.textColor = C.dim
  ft.centerAlignText()
}

// ── 错误 ──
function renderError(w, msg) {
  bg(w)
  w.addSpacer()
  const t = w.addText('无法加载')
  t.textColor = C.text
  t.font = Font.mediumSystemFont(14)
  t.centerAlignText()
  w.addSpacer(2)
  const d = w.addText(msg)
  d.font = Font.regularSystemFont(10)
  d.textColor = C.dim
  d.centerAlignText()
  w.addSpacer()
}

// ── Main ──
async function run() {
  const param = config.runsInWidget ? args.widgetParameter : null
  let city
  if (param) {
    const idx = parseInt(param)
    city = !isNaN(idx) && CONFIG.cities[idx]
      ? CONFIG.cities[idx]
      : CONFIG.cities.find(c => c.name === param || c.cityName === param)
  }
  if (!city) city = CONFIG.cities[CONFIG.defaultCityIdx]

  const w = new ListWidget()

  try {
    const data = await fetchData(city.lat, city.lon, city.name, city.cityName)
    if (config.widgetFamily === 'small') {
      renderSmall(w, data)
    } else {
      renderMain(w, data)
    }
  } catch (e) {
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
