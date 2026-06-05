import { useEffect, useRef } from 'react'

// 雪花：每粒存 pos=(x,y,radius,layer) + vel=(vx_base,vy,sway_amplitude,phase)。
// Compute shader 每帧累积 phase，用 sin 生成横向摆动（对齐 Canvas 版 sway 逻辑）。
// 渲染用 instanced quad + SDF 圆形裁切，边缘抗锯齿，三层透明度（远→近 0.35/0.65/0.92）。

function makeFlakes(W: number, H: number): Float32Array {
  const area = W * H
  const n = Math.round(Math.min(220, area / 5500))
  const TAU = Math.PI * 2
  const rnd = (a: number, b: number) => a + Math.random() * (b - a)
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const t = i / n
    let rMin: number, rMax: number, vyMin: number, vyMax: number, layer: number
    if (t < 0.6)      { rMin = 0.8; rMax = 1.6; vyMin = 10;  vyMax = 24; layer = 0 }
    else if (t < 0.9) { rMin = 1.8; rMax = 3.4; vyMin = 26;  vyMax = 55; layer = 1 }
    else              { rMin = 3.6; rMax = 5.5; vyMin = 55;  vyMax = 88; layer = 2 }
    // pos: (x, y, radius, layer)   vel: (vx_base, vy, sway_amplitude, phase)
    out.push(
      rnd(0, W), rnd(0, H), rnd(rMin, rMax), layer,
      rnd(-8, 8), rnd(vyMin, vyMax), rnd(8, 30), rnd(0, TAU),
    )
  }
  return new Float32Array(out)
}

const COMPUTE_WGSL = /* wgsl */`
struct Flake { pos: vec4f, vel: vec4f };
struct U { res: vec2f, dt: f32, _pad: f32 };
@group(0) @binding(0) var<storage, read_write> flakes: array<Flake>;
@group(0) @binding(1) var<uniform> u: U;

fn hash(n: u32) -> f32 {
  var x = n;
  x ^= x << 13u; x ^= x >> 17u; x ^= x << 5u;
  return f32(x & 0xffffffu) / 16777216.0;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= arrayLength(&flakes)) { return; }
  var f = flakes[i];
  f.vel.w += u.dt * 1.4;
  let sway = f.vel.z * sin(f.vel.w);
  f.pos.x += (f.vel.x + sway) * u.dt;
  f.pos.y += f.vel.y * u.dt;
  let r = f.pos.z;
  if (f.pos.y > u.res.y + r) {
    f.pos.y = -r;
    f.pos.x = hash(i * 2654435761u ^ u32(f.vel.w * 100.0 + 1000.0)) * u.res.x;
  }
  if (f.pos.x > u.res.x + 20.0) { f.pos.x -= u.res.x + 40.0; }
  if (f.pos.x < -20.0)           { f.pos.x += u.res.x + 40.0; }
  flakes[i] = f;
}
`

const RENDER_WGSL = /* wgsl */`
struct Flake { pos: vec4f, vel: vec4f };
struct U { res: vec2f, dt: f32, _pad: f32 };
@group(0) @binding(0) var<storage, read> flakes: array<Flake>;
@group(0) @binding(1) var<uniform> u: U;

struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) opacity: f32,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VOut {
  let f = flakes[ii];
  let cx = f.pos.x; let cy = f.pos.y; let r = f.pos.z; let layer = f.pos.w;
  var ux = array<f32,6>(-1.0, 1.0, -1.0, 1.0, -1.0, 1.0);
  var uy = array<f32,6>(-1.0, -1.0, 1.0, -1.0, 1.0, 1.0);
  let lx = ux[vi]; let ly = uy[vi];
  let world = vec2f(cx + lx * r, cy + ly * r);
  let clip = vec2f(world.x / u.res.x * 2.0 - 1.0, 1.0 - world.y / u.res.y * 2.0);
  var op = 0.35f;
  if (layer > 1.5f) { op = 0.92f; } else if (layer > 0.5f) { op = 0.65f; }
  return VOut(vec4f(clip, 0.0, 1.0), vec2f(lx, ly), op);
}

@fragment
fn fs(in: VOut) -> @location(0) vec4f {
  let d = length(in.uv);
  let alpha = (1.0 - smoothstep(0.82, 1.0, d)) * in.opacity;
  return vec4f(alpha, alpha, alpha, alpha);
}
`

function initSnow(canvas: HTMLCanvasElement, device: any, gpu: any): () => void {
  const BU = (globalThis as any).GPUBufferUsage
  const ctx = canvas.getContext('webgpu') as any
  const format = gpu.getPreferredCanvasFormat()
  ctx.configure({ device, format, alphaMode: 'premultiplied' })

  const uniformBuf = device.createBuffer({ size: 16, usage: BU.UNIFORM | BU.COPY_DST })
  const computePipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module: device.createShaderModule({ code: COMPUTE_WGSL }), entryPoint: 'main' },
  })
  const blend = {
    color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
    alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
  }
  const renderPipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex:   { module: device.createShaderModule({ code: RENDER_WGSL }), entryPoint: 'vs' },
    fragment: { module: device.createShaderModule({ code: RENDER_WGSL }), entryPoint: 'fs', targets: [{ format, blend }] },
    primitive: { topology: 'triangle-list' },
  })

  let W = 0, H = 0, count = 0
  let flakeBuf: any = null, computeBG: any = null, renderBG: any = null

  const build = () => {
    W = window.innerWidth; H = window.innerHeight
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width  = Math.max(1, Math.floor(W * dpr))
    canvas.height = Math.max(1, Math.floor(H * dpr))
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px'
    const data = makeFlakes(W, H)
    count = data.length / 8
    flakeBuf?.destroy?.()
    flakeBuf = device.createBuffer({ size: Math.max(32, data.byteLength), usage: BU.STORAGE | BU.COPY_DST })
    device.queue.writeBuffer(flakeBuf, 0, data)
    computeBG = device.createBindGroup({
      layout: computePipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: flakeBuf } }, { binding: 1, resource: { buffer: uniformBuf } }],
    })
    renderBG = device.createBindGroup({
      layout: renderPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: flakeBuf } }, { binding: 1, resource: { buffer: uniformBuf } }],
    })
  }
  build()
  window.addEventListener('resize', build)

  let raf = 0, last = 0
  const tick = (now: number) => {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016
    last = now
    if (count > 0) {
      device.queue.writeBuffer(uniformBuf, 0, new Float32Array([W, H, dt, 0]))
      const enc = device.createCommandEncoder()
      const cp = enc.beginComputePass()
      cp.setPipeline(computePipeline); cp.setBindGroup(0, computeBG)
      cp.dispatchWorkgroups(Math.ceil(count / 64)); cp.end()
      const view = ctx.getCurrentTexture().createView()
      const rp = enc.beginRenderPass({
        colorAttachments: [{ view, clearValue: { r:0, g:0, b:0, a:0 }, loadOp: 'clear', storeOp: 'store' }],
      })
      rp.setPipeline(renderPipeline); rp.setBindGroup(0, renderBG); rp.draw(6, count); rp.end()
      device.queue.submit([enc.finish()])
    }
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)

  const onVis = () => {
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0 }
    else if (!raf) { last = 0; raf = requestAnimationFrame(tick) }
  }
  document.addEventListener('visibilitychange', onVis)

  return () => {
    cancelAnimationFrame(raf)
    window.removeEventListener('resize', build)
    document.removeEventListener('visibilitychange', onVis)
    flakeBuf?.destroy?.(); uniformBuf?.destroy?.()
    device.destroy?.()
  }
}

export function SnowFXGPU({ onFallback }: { onFallback: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const fallbackRef = useRef(onFallback)
  fallbackRef.current = onFallback

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    let cleanup = () => {}
    let cancelled = false
    ;(async () => {
      try {
        const gpu = (navigator as any).gpu
        const adapter = await gpu.requestAdapter()
        if (!adapter) throw new Error('no adapter')
        const device = await adapter.requestDevice()
        if (cancelled) { device.destroy?.(); return }
        cleanup = initSnow(canvas, device, gpu)
      } catch {
        if (!cancelled) fallbackRef.current()
      }
    })()
    return () => { cancelled = true; cleanup() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return <canvas ref={ref} className="weather-fx" aria-hidden="true" />
}
