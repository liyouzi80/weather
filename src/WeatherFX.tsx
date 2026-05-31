// 实时天气动效（全屏背景层，克制·优雅）。
// 用单个 canvas + requestAnimationFrame 粒子系统，根据当前天气渲染对应特效：
//   雨 / 雷（雨+闪电）/ 雪 / 雾 / 晴日（光晕呼吸）/ 晴夜（星星微闪）/ 多云（云层缓移）。
// 尊重系统「减弱动态效果」：开启时降级为静态（不绘制运动粒子）。
import { useEffect, useRef } from 'react'

export type FxKind =
  | 'rain' | 'thunder' | 'snow' | 'fog'
  | 'clear-day' | 'clear-night' | 'cloudy'

// 天气文字 + 昼夜 → 特效类型（与 skyKey 对齐）
export function fxKind(text: string | undefined, night: boolean): FxKind {
  if (text) {
    if (/雷/.test(text)) return 'thunder'
    if (/雨/.test(text)) return 'rain'
    if (/雪/.test(text)) return 'snow'
    if (/雾|霾|沙|尘/.test(text)) return 'fog'
    if (/多云|间|阴/.test(text)) return 'cloudy'
  }
  return night ? 'clear-night' : 'clear-day'
}

const TAU = Math.PI * 2
const prefersReduced = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

interface Drop { x: number; y: number; len: number; vy: number; w: number }
interface Flake { x: number; y: number; r: number; vy: number; vx: number; sway: number; ph: number }
interface Star { x: number; y: number; r: number; ph: number; sp: number }
interface Cloud { x: number; y: number; s: number; vx: number; o: number }
interface Mote { x: number; y: number; r: number; vx: number; vy: number; o: number }
interface Bolt { pts: [number, number][] }

export function WeatherFX({ kind }: { kind: FxKind }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 2)
    const resize = () => {
      W = window.innerWidth
      H = window.innerHeight
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = W * dpr
      canvas.height = H * dpr
      canvas.style.width = W + 'px'
      canvas.style.height = H + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const reduced = prefersReduced()

    // ── 各特效的粒子初始化（数量克制，保证流畅）──
    const rnd = (a: number, b: number) => a + Math.random() * (b - a)
    const area = W * H

    const drops: Drop[] = []
    const flakes: Flake[] = []
    const stars: Star[] = []
    const clouds: Cloud[] = []
    const motes: Mote[] = []

    if (kind === 'rain' || kind === 'thunder') {
      const n = Math.round(Math.min(300, area / 4500))
      for (let i = 0; i < n; i++)
        drops.push({ x: rnd(0, W), y: rnd(0, H), len: rnd(14, 32), vy: rnd(460, 720), w: rnd(0.7, 1.6) })
    } else if (kind === 'snow') {
      const n = Math.round(Math.min(180, area / 7000))
      for (let i = 0; i < n; i++)
        flakes.push({ x: rnd(0, W), y: rnd(0, H), r: rnd(1.4, 3.8), vy: rnd(22, 60), vx: rnd(-10, 10), sway: rnd(10, 28), ph: rnd(0, TAU) })
    } else if (kind === 'clear-night') {
      const n = Math.round(Math.min(140, area / 9000))
      for (let i = 0; i < n; i++)
        stars.push({ x: rnd(0, W), y: rnd(0, H * 0.75), r: rnd(0.5, 2.0), ph: rnd(0, TAU), sp: rnd(0.8, 2.2) })
    } else if (kind === 'cloudy' || kind === 'fog') {
      const n = kind === 'fog' ? 8 : 6
      for (let i = 0; i < n; i++)
        clouds.push({ x: rnd(-0.3, 1) * W, y: rnd(0.02, 0.55) * H, s: rnd(0.9, 1.8), vx: rnd(6, 18) * (kind === 'fog' ? 0.6 : 1), o: rnd(0.12, 0.26) })
    } else {
      // clear-day：缓慢上浮的光尘
      const n = Math.round(Math.min(70, area / 18000))
      for (let i = 0; i < n; i++)
        motes.push({ x: rnd(0, W), y: rnd(0, H), r: rnd(0.8, 2.4), vx: rnd(-6, 6), vy: rnd(-16, -4), o: rnd(0.10, 0.30) })
    }

    // 闪电状态
    let flash = 0
    let nextBolt = rnd(1.0, 3.0)
    let bolt: Bolt | null = null
    const makeBolt = (): Bolt => {
      const pts: [number, number][] = [[rnd(W * 0.2, W * 0.8), 0]]
      const segs = 6 + Math.floor(Math.random() * 4)
      for (let i = 1; i <= segs; i++) {
        const px = pts[i - 1][0] + rnd(-40, 40)
        const py = (H * 0.65 * i) / segs
        pts.push([px, py])
      }
      return { pts }
    }

    const drawClouds = () => {
      for (const c of clouds) {
        const r = 180 * c.s
        const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, r)
        g.addColorStop(0, `rgba(200,212,228,${c.o})`)
        g.addColorStop(0.5, `rgba(200,212,228,${c.o * 0.5})`)
        g.addColorStop(1, 'rgba(200,212,228,0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(c.x, c.y, r, 0, TAU)
        ctx.fill()
      }
    }

    let raf = 0
    let last = performance.now()

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      ctx.clearRect(0, 0, W, H)

      switch (kind) {
        case 'rain':
        case 'thunder': {
          ctx.strokeStyle = 'rgba(174,208,240,0.62)'
          ctx.lineCap = 'round'
          for (const d of drops) {
            ctx.lineWidth = d.w
            ctx.beginPath()
            ctx.moveTo(d.x, d.y)
            ctx.lineTo(d.x - d.len * 0.24, d.y + d.len)
            ctx.stroke()
            if (!reduced) {
              d.y += d.vy * dt
              d.x -= d.vy * 0.24 * dt
              if (d.y > H + d.len) { d.y = -d.len; d.x = rnd(0, W) }
            }
          }
          if (kind === 'thunder' && !reduced) {
            nextBolt -= dt
            if (nextBolt <= 0) {
              flash = 1
              nextBolt = rnd(1.2, 4.5)
              bolt = makeBolt()
            }
            if (flash > 0) {
              ctx.fillStyle = `rgba(225,235,255,${flash * 0.62})`
              ctx.fillRect(0, 0, W, H)
              // 闪电主干
              if (bolt && flash > 0.3) {
                ctx.save()
                ctx.strokeStyle = `rgba(255,255,255,${flash * 0.95})`
                ctx.lineWidth = 1.8
                ctx.shadowColor = 'rgba(180,200,255,0.9)'
                ctx.shadowBlur = 12
                ctx.beginPath()
                ctx.moveTo(bolt.pts[0][0], bolt.pts[0][1])
                for (let i = 1; i < bolt.pts.length; i++) ctx.lineTo(bolt.pts[i][0], bolt.pts[i][1])
                ctx.stroke()
                ctx.restore()
              }
              flash -= dt * 2.8
              if (flash < 0) flash = 0
            }
          }
          break
        }
        case 'snow': {
          ctx.fillStyle = 'rgba(255,255,255,0.92)'
          for (const f of flakes) {
            ctx.globalAlpha = 0.65 + 0.32 * Math.sin(f.ph)
            ctx.beginPath()
            ctx.arc(f.x, f.y, f.r, 0, TAU)
            ctx.fill()
            if (!reduced) {
              f.ph += dt * 1.6
              f.y += f.vy * dt
              f.x += (f.vx + Math.sin(f.ph) * f.sway) * dt
              if (f.y > H + f.r) { f.y = -f.r; f.x = rnd(0, W) }
              if (f.x > W + 10) f.x = -10
              else if (f.x < -10) f.x = W + 10
            }
          }
          ctx.globalAlpha = 1
          break
        }
        case 'clear-night': {
          ctx.fillStyle = '#fff'
          for (const s of stars) {
            const tw = 0.4 + 0.58 * (0.5 + 0.5 * Math.sin(s.ph))
            ctx.globalAlpha = tw
            ctx.beginPath()
            ctx.arc(s.x, s.y, s.r, 0, TAU)
            ctx.fill()
            if (!reduced) s.ph += dt * s.sp
          }
          ctx.globalAlpha = 1
          break
        }
        case 'fog':
        case 'cloudy': {
          drawClouds()
          if (!reduced) for (const c of clouds) {
            c.x += c.vx * dt
            if (c.x - 160 * c.s > W) c.x = -160 * c.s
          }
          break
        }
        default: {
          // clear-day：暖色光尘缓升 + 顶部阳光晕圈
          const sunG = ctx.createRadialGradient(W * 0.78, -H * 0.05, 0, W * 0.78, -H * 0.05, H * 0.65)
          sunG.addColorStop(0, 'rgba(255,210,90,0.18)')
          sunG.addColorStop(0.45, 'rgba(255,180,60,0.08)')
          sunG.addColorStop(1, 'rgba(255,140,40,0)')
          ctx.fillStyle = sunG
          ctx.fillRect(0, 0, W, H)
          ctx.fillStyle = '#fff8e0'
          for (const m of motes) {
            ctx.globalAlpha = m.o
            ctx.beginPath()
            ctx.arc(m.x, m.y, m.r, 0, TAU)
            ctx.fill()
            if (!reduced) {
              m.x += m.vx * dt
              m.y += m.vy * dt
              if (m.y < -5) { m.y = H + 5; m.x = rnd(0, W) }
              if (m.x < -5) m.x = W + 5
              else if (m.x > W + 5) m.x = -5
            }
          }
          ctx.globalAlpha = 1
        }
      }

      if (!reduced) raf = requestAnimationFrame(frame)
    }

    // reduced：只画一帧静态；否则启动循环
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [kind])

  return <canvas ref={ref} className="weather-fx" aria-hidden="true" />
}
