// WeatherWidget.js — 多信源天气实况对比
// 布局遵循 Apple HIG 中号组件设计规范
// ===============================================

const CONFIG = {
  apiUrl: 'https://weather-8za.pages.dev/api/widget',
  cities: [
    { name: '番禺', lat: 22.9468, lon: 113.3622, cityName: '番禺' },
    { name: '安福', lat: 27.3954, lon: 114.6195, cityName: '安福' },
  ],
  defaultCityIdx: 0,
}

const SHORT = {
  'nmc': '中央气象台', 'gzqx': '番禺气象台', 'qweather': '和风天气',
  'caiyun': '彩云天气', 'owm': 'OWM', 'open-meteo': 'Open-Meteo',
}

const PC = {
  'nmc': '#ef4444', 'gzqx': '#a855f7', 'qweather': '#3b82f6',
  'caiyun': '#f59e0b', 'owm': '#f97316', 'open-meteo': '#22c55e',
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
  g.colors = [new Color('#050810'), new Color('#0c1526'), new Color('#080e18')]
  g.locations = [0, 0.5, 1]
  w.backgroundGradient = g
}

// ── 中号 / 大号 ──
// 版式：顶部一行（城市 + 天气 + 中位温度）→ 下方 6 信源两列网格 → 页脚。
function renderMain(w, data) {
  bg(w)
  w.setPadding(14, 16, 12, 16)

  const multi = data.count >= 2 && data.max !== data.min

  // ── 顶部：城市 + 天气（左），中位温度（右）──
  const header = w.addStack()
  header.layoutHorizontally()
  header.bottomAlignContent()

  const city = header.addText(data.city)
  city.font = Font.semiboldSystemFont(18)
  city.textColor = C.text
  city.lineLimit = 1
  if (data.text) {
    header.addSpacer(8)
    const wx = header.addText(data.text)
    wx.font = Font.regularSystemFont(14)
    wx.textColor = C.text2
    wx.lineLimit = 1
  }
  header.addSpacer()
  const median = data.median != null ? Math.round(data.median) : '—'
  const big = header.addText(`${median}°`)
  big.font = Font.boldSystemFont(36)
  big.textColor = C.text
  big.lineLimit = 1

  // 副标题：信源数 + 区间
  const sub = w.addStack()
  sub.layoutHorizontally()
  const subL = sub.addText(`${data.count} 个信源`)
  subL.font = Font.regularSystemFont(11)
  subL.textColor = C.dim
  if (multi) {
    sub.addSpacer()
    const subR = sub.addText(`${Math.round(data.max)}° / ${Math.round(data.min)}°`)
    subR.font = Font.regularSystemFont(11)
    subR.textColor = C.dim
  }

  w.addSpacer(11)

  // ── 两列网格：左列前半、右列后半 ──
  const grid = w.addStack()
  grid.layoutHorizontally()
  grid.spacing = 14

  const colA = grid.addStack()
  colA.layoutVertically()
  colA.spacing = 8
  colA.size = new Size(150, 0)

  const colB = grid.addStack()
  colB.layoutVertically()
  colB.spacing = 8

  const half = Math.ceil(data.providers.length / 2)
  data.providers.forEach((p, i) => {
    addProviderRow(i < half ? colA : colB, p, data, multi)
  })

  w.addSpacer()

  // ── 页脚：更新时间（钉底、居中）──
  const ft = w.addStack()
  ft.layoutHorizontally()
  ft.addSpacer()
  const time = data.updatedAt
    ? new Date(data.updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    : '—'
  const f = ft.addText(`更新 ${time}`)
  f.font = Font.regularSystemFont(10)
  f.textColor = C.dim
  ft.addSpacer()
}

// 一行信源：● 名称 …… 温度
function addProviderRow(col, p, data, multi) {
  const row = col.addStack()
  row.layoutHorizontally()
  row.centerAlignContent()

  const d = row.addText('●')
  d.font = Font.regularSystemFont(7)
  d.textColor = new Color(PC[p.id] || '#6e6e73')

  row.addSpacer(5)

  const nm = row.addText(SHORT[p.id] || p.name)
  nm.font = Font.regularSystemFont(13)
  nm.textColor = p.error ? C.dim : C.text
  nm.lineLimit = 1

  row.addSpacer()

  if (p.error) {
    const er = row.addText('—')
    er.font = Font.regularSystemFont(13)
    er.textColor = C.dim
  } else {
    const tp = row.addText(`${Math.round(p.temp)}°`)
    tp.font = Font.semiboldSystemFont(14)
    if (multi && p.temp === data.max) tp.textColor = C.hot
    else if (multi && p.temp === data.min) tp.textColor = C.cold
    else tp.textColor = C.text
    tp.lineLimit = 1
  }
}

// ── 小号 ──
function renderSmall(w, data) {
  bg(w)
  w.setPadding(16, 16, 16, 16)

  const city = w.addText(data.city)
  city.font = Font.semiboldSystemFont(13)
  city.textColor = C.text2
  city.centerAlignText()

  w.addSpacer(6)

  if (data.median != null) {
    const t = w.addText(`${Math.round(data.median)}°`)
    t.font = Font.boldSystemFont(36)
    t.textColor = C.text
    t.centerAlignText()
  }

  w.addSpacer(4)

  if (data.text) {
    const wx = w.addText(data.text)
    wx.font = Font.mediumSystemFont(10)
    wx.textColor = C.text2
    wx.centerAlignText()
  }

  w.addSpacer(8)

  const dots = w.addStack()
  dots.layoutHorizontally()
  dots.addSpacer()
  for (const p of data.providers) {
    if (p.temp == null) continue
    const d = dots.addText('●')
    d.font = Font.regularSystemFont(6)
    d.textColor = new Color(PC[p.id] || '#6e6e73')
    dots.addSpacer(3)
  }
  dots.addSpacer()

  w.addSpacer(6)

  const ft = w.addText(`${data.count}信源 · ${data.max}° / ${data.min}°`)
  ft.font = Font.regularSystemFont(8)
  ft.textColor = C.dim
  ft.centerAlignText()
}

// ── 错误 ──
function renderError(w, msg) {
  w.backgroundColor = new Color('#0a0d16')
  w.addSpacer()
  const ic = w.addText('⚠')
  ic.textColor = C.dim
  ic.centerAlignText()
  w.addSpacer(4)
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
