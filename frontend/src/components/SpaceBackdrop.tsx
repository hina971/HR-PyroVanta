import { useEffect, useRef } from 'react'

// Deep-space backdrop, ported from the demo: fixed starfield canvas
// (pre-rendered glow sprites, meteor shower, scroll-pause), real NASA
// photos via CSS (tokens.css: .nebula-photo, .milkyway, .galaxy-*,
// .planet-*, .sat-*), slow parallax on the non-Saturn layers.
// Saturn is deliberately NOT a parallax layer (blend isolation — see
// tokens.css); its drift animates the photo itself.
export default function SpaceBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bgRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let W = 0
    let H = 0
    let sfRaf = 0
    const COLORS = ['#FFFFFF', '#FFFFFF', '#E4ECF7', '#FFE3B3', '#F2E9DC', '#D7E3F2']
    interface Star { x: number; y: number; r: number; c: string; ph: number; sp: number }
    interface Meteor { x: number; y: number; vx: number; vy: number; life: number; ember: boolean; w: number }
    let stars: Star[] = []
    let meteors: Meteor[] = []
    let nextMeteor = 2500

    function glowSprite(hex: string): HTMLCanvasElement {
      const c = document.createElement('canvas')
      c.width = c.height = 32
      const x = c.getContext('2d')!
      const n = parseInt(hex.slice(1), 16)
      const r = (n >> 16) & 255
      const gg = (n >> 8) & 255
      const b = n & 255
      const gr = x.createRadialGradient(16, 16, 0, 16, 16, 16)
      gr.addColorStop(0, `rgba(${r},${gg},${b},1)`)
      gr.addColorStop(0.28, `rgba(${r},${gg},${b},.5)`)
      gr.addColorStop(1, `rgba(${r},${gg},${b},0)`)
      x.fillStyle = gr
      x.fillRect(0, 0, 32, 32)
      return c
    }
    const SPRITES: Record<string, HTMLCanvasElement> = {}
    COLORS.forEach((c) => { SPRITES[c] = glowSprite(c) })
    const METEOR_SPRITE_W = glowSprite('#DCE9F7')
    const METEOR_SPRITE_E = glowSprite('#FFBE78')

    function drawStatic() {
      ctx!.clearRect(0, 0, W, H)
      stars.forEach((s) => {
        ctx!.globalAlpha = 0.85
        ctx!.beginPath()
        ctx!.arc(s.x, s.y, s.r, 0, 7)
        ctx!.fillStyle = s.c
        ctx!.fill()
      })
      ctx!.globalAlpha = 1
    }

    function resize() {
      const dpr = Math.min(1.25, window.devicePixelRatio || 1)
      W = window.innerWidth
      H = window.innerHeight
      cv!.width = W * dpr
      cv!.height = H * dpr
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
      stars = []
      const n = Math.round(Math.min(240, (W * H) / 7000))
      for (let i = 0; i < n; i++)
        stars.push({
          x: Math.random() * W,
          y: Math.random() * H,
          r: Math.random() * 1.4 + 0.3,
          c: COLORS[Math.floor(Math.random() * COLORS.length)],
          ph: Math.random() * 6.283,
          sp: 0.4 + Math.random() * 1.3,
        })
      if (reduced) drawStatic()
    }

    const spaceBg = bgRef.current
    let lastScrollT = -1e9
    let scrollTimer = 0
    const onScrollPause = () => {
      lastScrollT = performance.now()
      if (spaceBg && !spaceBg.classList.contains('is-scrolling'))
        spaceBg.classList.add('is-scrolling')
      if (scrollTimer) clearTimeout(scrollTimer)
      scrollTimer = setTimeout(() => {
        if (spaceBg) spaceBg.classList.remove('is-scrolling')
      }, 160)
    }
    window.addEventListener('scroll', onScrollPause, { passive: true })

    function frame(t: number) {
      if (t - lastScrollT < 150) {
        sfRaf = requestAnimationFrame(frame)
        return
      }
      ctx!.clearRect(0, 0, W, H)
      stars.forEach((s) => {
        const tw = 0.3 + 0.7 * Math.abs(Math.sin(s.ph + t * 0.001 * s.sp))
        const sz = s.r * 8
        ctx!.globalAlpha = tw
        ctx!.drawImage(SPRITES[s.c], s.x - sz / 2, s.y - sz / 2, sz, sz)
        ctx!.beginPath()
        ctx!.arc(s.x, s.y, s.r * 0.5, 0, 7)
        ctx!.fillStyle = s.c
        ctx!.fill()
      })
      ctx!.globalAlpha = 1
      if (t > nextMeteor && meteors.length < 3) {
        const ember = Math.random() < 0.35
        meteors.push({
          x: W * 0.25 + Math.random() * W * 0.7,
          y: 10 + Math.random() * H * 0.3,
          vx: -(5.5 + Math.random() * 4.5),
          vy: 3 + Math.random() * 2.4,
          life: 1,
          ember,
          w: ember ? 2.4 : 1.8,
        })
        nextMeteor = t + 1800 + Math.random() * 2600
      }
      meteors = meteors.filter((m) => m.life > 0 && m.x > -120 && m.y < H + 120)
      meteors.forEach((m) => {
        m.x += m.vx
        m.y += m.vy
        m.life -= 0.014
        const tail = 10
        const a = 0.95 * Math.max(0, m.life)
        const grad = ctx!.createLinearGradient(m.x, m.y, m.x - m.vx * tail, m.y - m.vy * tail)
        grad.addColorStop(0, `rgba(255,255,255,${a})`)
        grad.addColorStop(0.35, m.ember ? `rgba(255,170,80,${a * 0.75})` : `rgba(195,212,235,${a * 0.75})`)
        grad.addColorStop(1, 'rgba(180,195,220,0)')
        ctx!.strokeStyle = grad
        ctx!.lineWidth = m.w
        ctx!.lineCap = 'round'
        ctx!.beginPath()
        ctx!.moveTo(m.x, m.y)
        ctx!.lineTo(m.x - m.vx * tail, m.y - m.vy * tail)
        ctx!.stroke()
        ctx!.globalAlpha = a
        ctx!.drawImage(m.ember ? METEOR_SPRITE_E : METEOR_SPRITE_W, m.x - 14, m.y - 14, 28, 28)
        ctx!.globalAlpha = 1
        ctx!.beginPath()
        ctx!.arc(m.x, m.y, m.w * 1.15, 0, 7)
        ctx!.fillStyle = `rgba(255,255,255,${a})`
        ctx!.fill()
      })
      sfRaf = requestAnimationFrame(frame)
    }

    resize()
    window.addEventListener('resize', resize)
    if (!reduced) sfRaf = requestAnimationFrame(frame)

    const onVis = () => {
      if (reduced) return
      if (document.hidden) {
        if (sfRaf) cancelAnimationFrame(sfRaf)
        sfRaf = 0
      } else if (!sfRaf) {
        sfRaf = requestAnimationFrame(frame)
      }
    }
    document.addEventListener('visibilitychange', onVis)

    // Butter-smooth scroll parallax (lerp, CSS `translate` property so it
    // never fights the float/drift animations on the same elements).
    // Saturn (.planet-ringed) is deliberately NOT a parallax layer.
    let glideId = 0
    const layers = Array.prototype.slice.call(
      document.querySelectorAll('.planet:not(.planet-ringed),.nebula,.galaxy,.sat-photo'),
    ) as HTMLElement[]
    if (!reduced && layers.length) {
      const depths = layers.map((el) => parseFloat(el.getAttribute('data-depth') || '10'))
      const last = layers.map(() => -1)
      let targetY = window.scrollY || 0
      let curY = targetY
      const applyParallax = () => {
        layers.forEach((el, i) => {
          const v = Math.round(Math.min(90, (curY * depths[i]) / 900) * 20) / 20
          if (v !== last[i]) {
            last[i] = v
            el.style.translate = '0 ' + v + 'px'
          }
        })
      }
      const glide = () => {
        curY += (targetY - curY) * 0.07
        if (Math.abs(targetY - curY) < 0.05) {
          curY = targetY
          applyParallax()
          glideId = 0
          return
        }
        applyParallax()
        glideId = requestAnimationFrame(glide)
      }
      const onScrollGlide = () => {
        targetY = window.scrollY || 0
        if (!glideId) glideId = requestAnimationFrame(glide)
      }
      window.addEventListener('scroll', onScrollGlide, { passive: true })
      applyParallax()
      return () => {
        window.removeEventListener('scroll', onScrollPause)
        window.removeEventListener('scroll', onScrollGlide)
        window.removeEventListener('resize', resize)
        document.removeEventListener('visibilitychange', onVis)
        if (sfRaf) cancelAnimationFrame(sfRaf)
        if (glideId) cancelAnimationFrame(glideId)
        if (scrollTimer) clearTimeout(scrollTimer)
      }
    }
    return () => {
      window.removeEventListener('scroll', onScrollPause)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVis)
      if (sfRaf) cancelAnimationFrame(sfRaf)
      if (scrollTimer) clearTimeout(scrollTimer)
    }
  }, [])

  return (
    <div className="space-bg" aria-hidden="true" ref={bgRef}>
      <div className="nebula-photo"></div>
      <div className="milkyway"></div>
      <div className="cosmos-wash"></div>
      <div className="galaxy galaxy-a" data-depth="8"></div>
      <div className="galaxy galaxy-b" data-depth="18"></div>
      <div className="nebula-scrim"></div>
      <canvas id="starfield" ref={canvasRef}></canvas>
      <div className="nebula nebula-a"></div>
      <div className="nebula nebula-b"></div>
      <div className="nebula nebula-c"></div>
      <div className="planet planet-ringed" data-depth="14"></div>
      <div className="planet planet-ice" data-depth="0"></div>
      <div className="planet planet-violet" data-depth="0"></div>
      <div className="planet planet-ember" data-depth="0"></div>
      <div className="planet planet-moon" data-depth="0"></div>
      <div className="comet"></div>
      <div className="sat-photo sat-iss" data-depth="0"></div>
      <div className="sat-photo sat-hubble" data-depth="0"></div>
    </div>
  )
}
