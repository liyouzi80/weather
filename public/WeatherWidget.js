// WeatherWidget.js — 多信源天气实况（与首页概览卡片一致）
// 仿苹果天气布局：地名 + 平均气温 + 天气 + 最高/最低 + 美国AQI评级。
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

// ── 美国 AQI（评级为主，配色同 App）──
function avgAqi(data) {
  return data && data.aqi && data.aqi.avg != null ? data.aqi.avg : null
}
function aqiColor(a) {
  if (a == null) return '#8e8e93'
  if (a <= 50) return '#34c759'
  if (a <= 100) return '#ffd60a'
  if (a <= 150) return '#ff9f0a'
  if (a <= 200) return '#ff453a'
  if (a <= 300) return '#af52de'
  return '#a1304e'
}
function aqiCategory(a) {
  if (a == null) return '—'
  if (a <= 50) return '优'
  if (a <= 100) return '良'
  if (a <= 150) return '轻度'
  if (a <= 200) return '中度'
  if (a <= 300) return '重度'
  return '严重'
}
// 评级为主体的彩色 chip：「良 33」
function addAqiChip(parent, aqi, catSize, numSize) {
  if (aqi == null) return
  const col = aqiColor(aqi)
  const chip = parent.addStack()
  chip.layoutHorizontally()
  chip.centerAlignContent()
  chip.backgroundColor = new Color(col, 0.22)
  chip.cornerRadius = 7
  chip.setPadding(2, 8, 2, 8)
  const c = chip.addText(aqiCategory(aqi))
  c.font = Font.boldSystemFont(catSize)
  c.textColor = new Color(col)
  const n = chip.addText(' ' + aqi)
  n.font = Font.semiboldSystemFont(numSize)
  n.textColor = new Color(col)
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

  // 美国 AQI：评级 chip + 主要污染物
  if (avgAqi(data) != null) {
    w.addSpacer(11)
    const arow = w.addStack()
    arow.layoutHorizontally()
    arow.centerAlignContent()
    arow.addSpacer()
    addAqiChip(arow, avgAqi(data), 14, 13)
    const src = (data.aqi.sources || []).find(s => s.dominant)
    if (src && src.dominant) {
      const d = arow.addText('  主要 ' + src.dominant)
      d.font = Font.systemFont(12)
      d.textColor = C.text2
    }
    arow.addSpacer()
  }

  w.addSpacer()

  const ft = w.addText(`更新 ${clock(data)}`)
  ft.font = Font.regularSystemFont(10)
  ft.textColor = C.dim
  ft.centerAlignText()
}

// ── 小号（仿苹果天气：左对齐，地名→大温度→天气→高低；右上角 AQI 评级）──
function renderSmall(w, data) {
  bg(w)
  w.setPadding(15, 16, 15, 16)

  // 顶部：地名（左） + AQI 评级 chip（右）
  const top = w.addStack()
  top.layoutHorizontally()
  top.centerAlignContent()
  const city = top.addText(data.city)
  city.font = Font.semiboldSystemFont(15)
  city.textColor = C.text
  city.lineLimit = 1
  city.minimumScaleFactor = 0.7
  top.addSpacer()
  addAqiChip(top, avgAqi(data), 12, 11)

  w.addSpacer()

  // 大温度
  const big = w.addText(avgStr(data))
  big.font = Font.boldSystemFont(44)
  big.textColor = C.text
  big.minimumScaleFactor = 0.6
  big.lineLimit = 1

  w.addSpacer(3)

  // 天气：emoji + 文案
  const cond = w.addStack()
  cond.layoutHorizontally()
  cond.centerAlignContent()
  const e = cond.addText(weatherEmoji(data.text) + ' ')
  e.font = Font.systemFont(13)
  const ct = cond.addText(data.text || '—')
  ct.font = Font.systemFont(13)
  ct.textColor = C.text2
  ct.lineLimit = 1

  w.addSpacer(7)

  // 高 / 低
  const hilo = w.addStack()
  hilo.layoutHorizontally()
  hilo.centerAlignContent()
  addHL(hilo, '高', data.max, C.hot, 11, 13)
  hilo.addSpacer(12)
  addHL(hilo, '低', data.min, C.cold, 11, 13)
  hilo.addSpacer()
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
