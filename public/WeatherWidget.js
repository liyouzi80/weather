// WeatherWidget.js — 多信源天气实况（与首页概览卡片一致）
// 仿苹果天气布局：地名 + 平均气温 + 天气 + 最高/最低 + 美国AQI评级。
// ===============================================

const CONFIG = {
  apiUrl: 'https://weather-8za.pages.dev/api/widget',
  siteUrl: 'https://weather-8za.pages.dev/',
  cities: [
    { name: '番禺区', lat: 22.9468, lon: 113.3622, cityName: '番禺' },
    { name: '安福县', lat: 27.3954, lon: 114.6195, cityName: '安福' },
  ],
  defaultCityIdx: 0,
}

// 温度取整字符串
function tempStr(v) {
  return v != null ? `${Math.round(v)}°` : '—'
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

// ── 中号 / 大号（仿苹果天气：左侧实况，右侧高低 + AQI）──
function renderMain(w, data) {
  bg(w)
  w.setPadding(16, 18, 14, 18)

  const row = w.addStack()
  row.layoutHorizontally()
  row.topAlignContent()

  // 左：城市 / 大温度 / 天气
  const left = row.addStack()
  left.layoutVertically()
  const city = left.addText(data.city)
  city.font = Font.semiboldSystemFont(17)
  city.textColor = C.text
  left.addSpacer(2)
  const big = left.addText(avgStr(data))
  big.font = Font.boldSystemFont(52)
  big.textColor = C.text
  big.minimumScaleFactor = 0.6
  big.lineLimit = 1
  if (data.text) {
    left.addSpacer(3)
    const cond = left.addStack()
    cond.layoutHorizontally()
    cond.centerAlignContent()
    const e = cond.addText(weatherEmoji(data.text) + ' ')
    e.font = Font.systemFont(14)
    const ct = cond.addText(data.text)
    ct.font = Font.systemFont(14)
    ct.textColor = C.text2
    ct.lineLimit = 1
  }

  row.addSpacer()

  // 右：高/低 + AQI 评级 + 主要污染物
  const right = row.addStack()
  right.layoutVertically()
  right.addSpacer(4)
  const hi = right.addStack(); hi.layoutHorizontally(); hi.addSpacer(); addHL(hi, '高', data.max, C.hot, 12, 15)
  right.addSpacer(4)
  const lo = right.addStack(); lo.layoutHorizontally(); lo.addSpacer(); addHL(lo, '低', data.min, C.cold, 12, 15)
  if (avgAqi(data) != null) {
    right.addSpacer(12)
    const ar = right.addStack(); ar.layoutHorizontally(); ar.addSpacer(); addAqiChip(ar, avgAqi(data), 14, 12)
    const src = (data.aqi.sources || []).find(s => s.dominant)
    if (src && src.dominant) {
      right.addSpacer(4)
      const dr = right.addStack(); dr.layoutHorizontally(); dr.addSpacer()
      const d = dr.addText('主要 ' + src.dominant)
      d.font = Font.systemFont(11)
      d.textColor = C.text2
    }
  }

  w.addSpacer()

  const ft = w.addText(`更新 ${clock(data)}`)
  ft.font = Font.regularSystemFont(10)
  ft.textColor = C.dim
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

  // 天气：emoji + 文案（无数据时不显示默认云图标）
  const cond = w.addStack()
  cond.layoutHorizontally()
  cond.centerAlignContent()
  if (data.text) {
    const e = cond.addText(weatherEmoji(data.text) + ' ')
    e.font = Font.systemFont(13)
  }
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

// ── 锁屏小组件（iOS 16+ accessory，系统单色渲染，不设背景/颜色）──
function renderInline(w, data) {
  const a = avgAqi(data)
  const aqi = a != null ? ` · AQI ${aqiCategory(a)}${a}` : ''
  w.addText(`${data.city} ${avgStr(data)} ${data.text || ''}${aqi}`)
}
function renderCircular(w, data) {
  w.addSpacer()
  const s = w.addStack()
  s.layoutVertically()
  s.centerAlignContent()
  const big = s.addText(avgStr(data))
  big.font = Font.boldSystemFont(22)
  big.centerAlignText()
  big.minimumScaleFactor = 0.5
  big.lineLimit = 1
  const a = avgAqi(data)
  const sub = s.addText(a != null ? `${aqiCategory(a)}${a}` : data.city)
  sub.font = Font.systemFont(9)
  sub.centerAlignText()
  sub.minimumScaleFactor = 0.5
  sub.lineLimit = 1
  w.addSpacer()
}
function renderRectangular(w, data) {
  const l1 = w.addText(`${data.city}  ${avgStr(data)}`)
  l1.font = Font.semiboldSystemFont(15)
  l1.lineLimit = 1
  const l2 = w.addText(`${data.text || '—'}  高${tempStr(data.max)} 低${tempStr(data.min)}`)
  l2.font = Font.systemFont(12)
  l2.lineLimit = 1
  const a = avgAqi(data)
  const l3 = w.addText(a != null ? `AQI ${aqiCategory(a)} ${a}${data.aqi.sources?.find(s => s.dominant)?.dominant ? ' · 主要 ' + data.aqi.sources.find(s => s.dominant).dominant : ''}` : 'AQI —')
  l3.font = Font.systemFont(12)
  l3.lineLimit = 1
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
  w.url = CONFIG.siteUrl // 点按打开网页 App

  try {
    const data = await fetchData(city.lat, city.lon, city.name, city.cityName)
    const fam = config.widgetFamily
    if (fam === 'accessoryInline') renderInline(w, data)
    else if (fam === 'accessoryCircular') renderCircular(w, data)
    else if (fam === 'accessoryRectangular') renderRectangular(w, data)
    else if (fam === 'small') renderSmall(w, data)
    else renderMain(w, data)
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
