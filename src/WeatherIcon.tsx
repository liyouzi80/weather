// SF Symbols 风格的天气图标（内联 SVG，彩色、统一）。替代 emoji。
// 根据天气文字 + 昼夜选择图标。

type IconType =
  | 'sun' | 'moon' | 'cloud' | 'partly-day' | 'partly-night'
  | 'rain' | 'snow' | 'fog' | 'thunder'

function iconType(text: string | undefined, night: boolean): IconType {
  if (text) {
    if (/雷/.test(text)) return 'thunder'
    if (/雪/.test(text)) return 'snow'
    if (/雨/.test(text)) return 'rain'
    if (/雾|霾|沙|尘/.test(text)) return 'fog'
    if (/阴/.test(text)) return 'cloud'
    if (/多云|间/.test(text)) return night ? 'partly-night' : 'partly-day'
  }
  return night ? 'moon' : 'sun'
}

const COL = {
  sun: '#ffce47',
  moon: '#dfe7f4',
  cloud: '#c2cddd',
  cloudDark: '#9aa7bb',
  rain: '#5bb0f4',
  snow: '#d6e8ff',
  bolt: '#ffd23f',
  fog: '#aab4c2',
}

// 云朵（圆形+圆底组合，稳定好看）
function Cloud({ fill, dx = 0, dy = 0, s = 1 }: { fill: string; dx?: number; dy?: number; s?: number }) {
  return (
    <g transform={`translate(${dx},${dy}) scale(${s})`} fill={fill}>
      <circle cx="18" cy="29" r="8" />
      <circle cx="31" cy="26" r="10" />
      <circle cx="25" cy="32" r="9" />
      <rect x="13" y="29" width="24" height="9" rx="4.5" />
    </g>
  )
}

function Sun({ cx = 24, cy = 22, r = 9 }: { cx?: number; cy?: number; r?: number }) {
  const rays = [0, 45, 90, 135, 180, 225, 270, 315]
  return (
    <g>
      <g stroke={COL.sun} strokeWidth="2.4" strokeLinecap="round">
        {rays.map((a) => {
          const rad = (a * Math.PI) / 180
          const x1 = cx + Math.cos(rad) * (r + 4)
          const y1 = cy + Math.sin(rad) * (r + 4)
          const x2 = cx + Math.cos(rad) * (r + 8)
          const y2 = cy + Math.sin(rad) * (r + 8)
          return <line key={a} x1={x1} y1={y1} x2={x2} y2={y2} />
        })}
      </g>
      <circle cx={cx} cy={cy} r={r} fill={COL.sun} />
    </g>
  )
}

function Moon() {
  return <path d="M30 8 a16 16 0 1 0 9 29 A12.5 12.5 0 1 1 30 8 Z" fill={COL.moon} />
}

export function WeatherIcon({ text, size = 24, className }: { text?: string; size?: number; className?: string }) {
  // 昼夜按北京时（番禺/安福均在 UTC+8），不随设备时区
  const h = new Date(Date.now() + 8 * 3600 * 1000).getUTCHours()
  const night = h < 6 || h >= 19
  const t = iconType(text, night)

  let body: React.ReactNode
  switch (t) {
    case 'sun':
      body = <Sun />
      break
    case 'moon':
      body = <Moon />
      break
    case 'cloud':
      body = <Cloud fill={COL.cloud} />
      break
    case 'partly-day':
      body = (
        <>
          <Sun cx={17} cy={16} r={6.5} />
          <Cloud fill={COL.cloud} dx={5} dy={6} s={0.86} />
        </>
      )
      break
    case 'partly-night':
      body = (
        <>
          <g transform="translate(2,-2) scale(0.62)"><Moon /></g>
          <Cloud fill={COL.cloud} dx={5} dy={6} s={0.86} />
        </>
      )
      break
    case 'rain':
      body = (
        <>
          <Cloud fill={COL.cloudDark} dy={-3} />
          <g stroke={COL.rain} strokeWidth="2.6" strokeLinecap="round">
            <line x1="17" y1="36" x2="15" y2="42" />
            <line x1="25" y1="36" x2="23" y2="42" />
            <line x1="33" y1="36" x2="31" y2="42" />
          </g>
        </>
      )
      break
    case 'snow':
      body = (
        <>
          <Cloud fill={COL.cloudDark} dy={-3} />
          <g fill={COL.snow}>
            <circle cx="17" cy="39" r="2" />
            <circle cx="25" cy="41" r="2" />
            <circle cx="33" cy="39" r="2" />
          </g>
        </>
      )
      break
    case 'thunder':
      body = (
        <>
          <Cloud fill={COL.cloudDark} dy={-3} />
          <path d="M25 34 l-6 9 h5 l-2 6 8-11 h-5 l3-4 z" fill={COL.bolt} />
        </>
      )
      break
    case 'fog':
      body = (
        <>
          <Cloud fill={COL.cloud} dy={-4} />
          <g stroke={COL.fog} strokeWidth="2.6" strokeLinecap="round">
            <line x1="14" y1="38" x2="34" y2="38" />
            <line x1="17" y1="43" x2="31" y2="43" />
          </g>
        </>
      )
      break
  }

  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden="true">
      {body}
    </svg>
  )
}
