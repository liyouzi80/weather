// WeatherWidget.js — 多信源天气实况对比
// ===============================================
// 桌面小组件：展示所选城市的各信源实时温度对比
//
// 使用：
// 1. Scriptable App 中新建脚本，粘贴全部内容
// 2. 添加到桌面（推荐中号或大号）
// 3. Widget Parameter：填城市名「番禺」或「安福」
// ===============================================

const CONFIG = {
  apiUrl: 'https://weather-8za.pages.dev/api/widget',
  cities: [
    { name: '番禺', lat: 22.9468, lon: 113.3622, cityName: '番禺' },
    { name: '安福', lat: 27.3954, lon: 114.6195, cityName: '安福' },
  ],
  defaultCityIdx: 0,
}

// ── 信源颜色（与网页版一致）───────────────────
const COLORS = {
  'nmc':        { hex: '#ef4444', name: '红' },
  'gzqx':       { hex: '#a855f7', name: '紫' },
  'qweather':   { hex: '#3b82f6', name: '蓝' },
  'caiyun':     { hex: '#f59e0b', name: '黄' },
  'owm':        { hex: '#f97316', name: '橙' },
  'weatherapi': { hex: '#0ea5e9', name: '青' },
  'open-meteo': { hex: '#22c55e', name: '绿' },
}
const DEFAULT_COLOR = '#6e6e73'

const C = {
  bg:      new Color('#03050b'),
  surface: new Color('#0f1420'),
  text:    new Color('#f5f5f7'),
  text2:   new Color('#98989d'),
  dim:     new Color('#6e6e73'),
  hot:     new Color('#ff453a'),
  cold:    new Color('#40c8e0'),
  warn:    new Color('#ffd60a'),
  border:  new Color('#ffffff', 0.06),
  glass:   new Color('#ffffff', 0.04),
}

// ── 数据获取 ──
let _cacheKey = '', _cacheData = null

async function fetchData(lat, lon, name, cityName) {
  const key = `${lat},${lon},${name}`
  if (key === _cacheKey && _cacheData) return _cacheData
  const params = `lat=${lat}&lon=${lon}&name=${encodeURIComponent(name)}&cityName=${encodeURIComponent(cityName)}`
  const req = new Request(`${CONFIG.apiUrl}?${params}`)
  req.timeoutInterval = 15
  const res = await req.loadJSON()
  _cacheKey = key
  _cacheData = res
  return res
}

// ── 辅助 ──
function providerColor(id) {
  return new Color((COLORS[id] || {}).hex || DEFAULT_COLOR)
}

function providerColorHex(id) {
  return (COLORS[id] || {}).hex || DEFAULT_COLOR
}

// ── 渐变背景 ──
function setBackground(w) {
  const g = new LinearGradient()
  g.colors = [new Color('#050810'), new Color('#0c1528'), new Color('#080e1c')]
  g.locations = [0, 0.45, 1]
  w.backgroundGradient = g
}

// ── 绘制一张卡片圆角矩形（模拟） ──
function drawCard(stack, accentHex) {
  stack.backgroundColor = C.glass
  stack.cornerRadius = 12
  stack.setPadding(12, 14, 12, 14)
}

// ── 页头：城市名 + 统计 ──
function renderHeader(w, data) {
  const row = w.addStack()
  row.layoutHorizontally()
  row.centerAlignContent()

  const name = row.addText(data.city)
  name.font = Font.boldSystemFont(22)
  name.textColor = C.text
  name.lineLimit = 1

  row.addSpacer(8)

  if (data.text) {
    const txt = row.addText(data.text)
    txt.font = Font.mediumSystemFont(15)
    txt.textColor = C.text2
    txt.lineLimit = 1
  }

  row.addSpacer()

  const badge = row.addText(`${data.count}/${data.total}`)
  badge.font = Font.mediumSystemFont(11)
  badge.textColor = C.dim
}

// ── 统计摘要行 ──
function renderSummary(w, data) {
  if (data.count < 2) return
  const row = w.addStack()
  row.layoutHorizontally()
  row.spacing = 14

  const hi = row.addText(`${data.max}°`)
  hi.font = Font.boldSystemFont(13)
  hi.textColor = C.hot

  const med = row.addText(`中位 ${data.median != null ? data.median.toFixed(1) : '—'}°`)
  med.font = Font.mediumSystemFont(12)
  med.textColor = C.text2

  const lo = row.addText(`${data.min}°`)
  lo.font = Font.boldSystemFont(13)
  lo.textColor = C.cold

  row.addSpacer()

  const spread = data.max - data.min
  if (spread > 0) {
    const sp = row.addText(`分歧 ${spread.toFixed(1)}°`)
    sp.font = Font.mediumSystemFont(11)
    sp.textColor = spread >= 2 ? C.warn : C.dim
  }
}

// ── 单张信源卡片 ──
function renderCard(w, p, median, max, min, hasMultiple) {
  // 卡片容器
  const card = w.addStack()
  card.layoutHorizontally()
  card.backgroundColor = new Color('#ffffff', 0.04)
  card.cornerRadius = 12
  card.setPadding(0, 0, 0, 0)

  // 左侧色条
  const accent = new Color(providerColorHex(p.id))
  const bar = card.addStack()
  bar.size = new Size(4, 0)
  bar.backgroundColor = accent
  bar.cornerRadius = 2

  // 内容区
  const body = card.addStack()
  body.layoutVertically()
  body.setPadding(12, 12, 12, 12)

  // 第一行：名称 + 标签 + 温度
  const top = body.addStack()
  top.layoutHorizontally()
  top.centerAlignContent()

  // 名称
  const nameLabel = top.addText(p.name)
  nameLabel.font = Font.mediumSystemFont(14)
  nameLabel.textColor = p.error ? C.dim : C.text
  nameLabel.lineLimit = 1

  top.addSpacer(6)

  // 最高/最低标签
  if (p.temp != null && hasMultiple && max !== min) {
    if (p.temp === max) {
      const tagMax = top.addText('最高')
      tagMax.font = Font.boldSystemFont(9)
      tagMax.textColor = C.hot
      tagMax.backgroundColor = new Color('#ff453a', 0.15)
      tagMax.cornerRadius = 3
    } else if (p.temp === min) {
      const tagMin = top.addText('最低')
      tagMin.font = Font.boldSystemFont(9)
      tagMin.textColor = C.cold
      tagMin.backgroundColor = new Color('#40c8e0', 0.15)
      tagMin.cornerRadius = 3
    }
  }

  top.addSpacer()

  // 温度
  if (p.error) {
    const err = top.addText('—')
    err.font = Font.semiboldSystemFont(20)
    err.textColor = C.dim
  } else {
    const temp = top.addText(`${p.temp}°`)
    temp.font = Font.boldSystemFont(24)
    if (p.temp === max && hasMultiple && max !== min) {
      temp.textColor = C.hot
    } else if (p.temp === min && hasMultiple && max !== min) {
      temp.textColor = C.cold
    } else {
      temp.textColor = C.text
    }
  }

  // 第二行：天气描述 + 偏差
  if (!p.error) {
    body.addSpacer(2)
    const bot = body.addStack()
    bot.layoutHorizontally()
    bot.centerAlignContent()

    if (p.text) {
      const txt = bot.addText(p.text)
      txt.font = Font.regularSystemFont(12)
      txt.textColor = C.text2
      txt.lineLimit = 1
    }

    bot.addSpacer()

    if (median != null && p.temp != null) {
      const delta = p.temp - median
      if (Math.abs(delta) >= 0.05) {
        const sign = delta > 0 ? '+' : ''
        const d = bot.addText(`${sign}${delta.toFixed(1)}°`)
        d.font = Font.mediumSystemFont(12)
        d.textColor = delta > 0 ? C.hot : C.cold
      }
    }
  } else {
    body.addSpacer(2)
    const errMsg = body.addText(p.error)
    errMsg.font = Font.regularSystemFont(10)
    errMsg.textColor = C.dim
    errMsg.lineLimit = 1
  }
}

// ── 底部 ──
function renderFooter(w, updatedAt, count) {
  const row = w.addStack()
  row.layoutHorizontally()
  row.addSpacer()
  const time = updatedAt
    ? new Date(updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    : '—'
  const label = row.addText(`更新于 ${time} · ${count} 个信源`)
  label.font = Font.regularSystemFont(9)
  label.textColor = C.dim
  row.addSpacer()
}

// ── 错误状态 ──
function renderError(w, msg) {
  w.backgroundColor = C.bg
  w.addSpacer()
  const icon = w.addText('⚠')
  icon.font = Font.systemFont(24)
  icon.centerAlignText()
  w.addSpacer(6)
  const title = w.addText('无法加载')
  title.font = Font.semiboldSystemFont(15)
  title.textColor = C.text
  title.centerAlignText()
  w.addSpacer(4)
  const detail = w.addText(msg)
  detail.font = Font.regularSystemFont(11)
  detail.textColor = C.dim
  detail.centerAlignText()
  w.addSpacer()
}

// ── 组合渲染 ──
function renderWidget(w, data) {
  setBackground(w)
  w.setPadding(16, 16, 14, 16)

  renderHeader(w, data)
  w.addSpacer(6)
  renderSummary(w, data)

  const hasMultiple = data.count >= 2 && data.max !== data.min
  const ok = data.providers.filter(p => p.temp != null)

  w.addSpacer(10)
  for (const p of data.providers) {
    renderCard(w, p, data.median, data.max, data.min, hasMultiple)
    w.addSpacer(6)
  }

  w.addSpacer(2)
  renderFooter(w, data.updatedAt, data.count)
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

  if (!config.runsInWidget) {
    const preview = new ListWidget()
    preview.addText(`${city.name} · 天气实况对比`)
    preview.addText(CONFIG.apiUrl)
    preview.presentSmall()
  }

  const w = new ListWidget()

  try {
    const data = await fetchData(city.lat, city.lon, city.name, city.cityName)
    renderWidget(w, data)
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
