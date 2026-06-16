import { useEffect, useRef } from 'react'
import { useRainGPU } from './RainFXGPU'

// 雷暴：WebGPU 画雨滴（同 RainFXGPU），Canvas 2D 叠加闪电/闪光。
// 两个 canvas 都是 position:fixed; inset:0，自然重叠，bolt canvas 在上层。

interface Bolt {
  pts: [number, number][]
  branches: { pts: [number, number][] }[]
}

function useBoltCanvas(ref: React.RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let W = 0, H = 0, dpr = 1
    const resize = () => {
      W = window.innerWidth; H = window.innerHeight
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width  = Math.max(1, Math.floor(W * dpr))
      canvas.height = Math.max(1, Math.floor(H * dpr))
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const rnd = (a: number, b: number) => a + Math.random() * (b - a)

    const makeBolt = (): Bolt => {
      const pts: [number, number][] = [[rnd(W * 0.15, W * 0.85), 0]]
      const segs = 7 + Math.floor(Math.random() * 5)
      for (let i = 1; i <= segs; i++)
        pts.push([pts[i - 1][0] + rnd(-55, 55), (H * 0.72 * i) / segs])
      const branches: { pts: [number, number][] }[] = []
      const bi = 2 + Math.floor(Math.random() * 3)
      if (bi < pts.length - 1) {
        const bpts: [number, number][] = [pts[bi]]
        for (let i = 1; i <= 3 + Math.floor(Math.random() * 2); i++)
          bpts.push([bpts[i - 1][0] + rnd(-40, 40), bpts[0][1] + (H * 0.28 * i) / 4])
        branches.push({ pts: bpts })
      }
      return { pts, branches }
    }

    // 描边路径辅助（不触发 stroke，让调用方控制样式后再 stroke）
    const tracePath = (pts: [number, number][]) => {
      ctx.beginPath()
      ctx.moveTo(pts[0][0], pts[0][1])
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
    }

    let flash = 0, nextBolt = rnd(1.2, 3.5), bolt: Bolt | null = null
    let rafId = 0, timerId = 0, last = 0

    // 没有活跃闪电时休眠，节省 CPU；快接近下次触发时才唤醒
    const cancelAll = () => {
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0 }
      if (timerId) { clearTimeout(timerId); timerId = 0 }
    }
    const scheduleNext = () => {
      if (flash > 0 || nextBolt < 1.0) {
        rafId = requestAnimationFrame(frame)
      } else {
        const ms = Math.max(0, (nextBolt - 0.9) * 1000)
        timerId = window.setTimeout(() => {
          timerId = 0; last = 0; rafId = requestAnimationFrame(frame)
        }, ms)
      }
    }

    const frame = (now: number) => {
      rafId = 0
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016
      last = now
      ctx.clearRect(0, 0, W, H)

      nextBolt -= dt
      if (nextBolt <= 0) { flash = 1; nextBolt = rnd(1.5, 5.0); bolt = makeBolt() }

      if (flash > 0) {
        ctx.fillStyle = `rgba(225,235,255,${flash * 0.55})`
        ctx.fillRect(0, 0, W, H)
        if (bolt && flash > 0.2) {
          ctx.save()
          ctx.lineCap = 'round'
          // 主干：宽→中→细三层叠加模拟发光（替代 shadowBlur，移动端 GPU 负担更低）
          ctx.lineWidth = 12; ctx.strokeStyle = `rgba(140,175,255,${flash * 0.15})`
          tracePath(bolt.pts); ctx.stroke()
          ctx.lineWidth = 6;  ctx.strokeStyle = `rgba(185,210,255,${flash * 0.32})`
          tracePath(bolt.pts); ctx.stroke()
          ctx.lineWidth = 2.4; ctx.strokeStyle = `rgba(255,255,255,${flash * 0.98})`
          tracePath(bolt.pts); ctx.stroke()
          // 分支
          for (const br of bolt.branches) {
            ctx.lineWidth = 6;   ctx.strokeStyle = `rgba(140,175,255,${flash * 0.10})`
            tracePath(br.pts); ctx.stroke()
            ctx.lineWidth = 3;   ctx.strokeStyle = `rgba(185,210,255,${flash * 0.22})`
            tracePath(br.pts); ctx.stroke()
            ctx.lineWidth = 1.2; ctx.strokeStyle = `rgba(210,230,255,${flash * 0.65})`
            tracePath(br.pts); ctx.stroke()
          }
          ctx.restore()
        }
        flash -= dt * 3.2
        if (flash < 0) flash = 0
      }

      scheduleNext()
    }
    scheduleNext()

    const onVis = () => {
      if (document.hidden) { cancelAll() }
      else if (!rafId && !timerId) { last = 0; scheduleNext() }
    }
    document.addEventListener('visibilitychange', onVis)

    return () => {
      cancelAll()
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}

export function ThunderFXGPU({ onFallback }: { onFallback: () => void }) {
  const rainRef = useRef<HTMLCanvasElement>(null)
  const boltRef = useRef<HTMLCanvasElement>(null)
  useRainGPU(rainRef, onFallback)
  useBoltCanvas(boltRef)
  return (
    <>
      <canvas ref={rainRef} className="weather-fx" aria-hidden="true" />
      <canvas ref={boltRef} className="weather-fx" aria-hidden="true" style={{ zIndex: 1 }} />
    </>
  )
}
