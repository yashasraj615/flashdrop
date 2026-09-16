"use client"

import { useEffect, useRef } from "react"

import { useAtmosphere } from "@/components/atmosphere"

type Particle = {
  angle: number
  radius: number
  speed: number
  size: number
  hue: number
}

export function SpaceTunnel() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { scene, progress } = useAtmosphere()
  const sceneRef = useRef(scene)
  const progressRef = useRef(progress)
  sceneRef.current = scene
  progressRef.current = progress

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reduce) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let frame = 0
    let running = true
    let display = 0
    let ripple = 0
    const started = performance.now()
    const particles: Particle[] = Array.from({ length: 48 }, () => ({
      angle: Math.random() * Math.PI * 2,
      radius: 0.18 + Math.random() * 0.82,
      speed: 0.12 + Math.random() * 0.22,
      size: 0.6 + Math.random() * 1.8,
      hue: 168 + Math.random() * 42,
    }))

    const resize = () => {
      const dpr = Math.min(1.25, window.devicePixelRatio || 1)
      canvas.width = Math.max(1, Math.floor(canvas.clientWidth * dpr))
      canvas.height = Math.max(1, Math.floor(canvas.clientHeight * dpr))
    }
    resize()
    window.addEventListener("resize", resize)

    const draw = (now: number) => {
      if (!running) return
      if (document.hidden) {
        frame = requestAnimationFrame(draw)
        return
      }
      const currentScene = sceneRef.current
      const currentProgress = progressRef.current
      const target =
        currentScene === "uploading"
          ? 0.22 + Math.min(1, currentProgress / 100) * 0.72
          : currentScene === "completing"
            ? 1
            : 0
      display += (target - display) * 0.055
      if (currentScene === "completing") ripple = Math.min(1, ripple + 0.038)
      else ripple += (0 - ripple) * 0.08

      const width = canvas.width
      const height = canvas.height
      ctx.clearRect(0, 0, width, height)
      if (display < 0.01 && ripple < 0.01) {
        frame = requestAnimationFrame(draw)
        return
      }

      const cx = width / 2
      const cy = height * 0.42
      const t = (now - started) / 1000
      const dpr = Math.min(1.25, window.devicePixelRatio || 1)

      for (let i = 16; i >= 0; i -= 1) {
        const travel = (t * (0.28 + display * 0.55) + i / 16) % 1
        const radius = (28 + travel * Math.max(width, height) * 0.58) * dpr
        const alpha = (1 - travel) * display * 0.16
        ctx.beginPath()
        ctx.ellipse(cx, cy, radius * 0.58, radius, 0, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(${40 + i * 6}, ${190 + i * 2}, ${210 + i * 2}, ${alpha})`
        ctx.lineWidth = Math.max(1, (2.6 - travel * 1.8) * dpr)
        ctx.stroke()
      }

      for (const particle of particles) {
        particle.radius -= particle.speed * 0.006 * (0.35 + display)
        if (particle.radius < 0.04) particle.radius = 1
        const px = cx + Math.cos(particle.angle + t * 0.15) * particle.radius * width * 0.42
        const py = cy + Math.sin(particle.angle + t * 0.12) * particle.radius * height * 0.38
        const trail = 18 * dpr * display
        ctx.beginPath()
        ctx.moveTo(px, py)
        ctx.lineTo(
          px + Math.cos(particle.angle) * trail * particle.radius,
          py + Math.sin(particle.angle) * trail * particle.radius
        )
        ctx.strokeStyle = `hsla(${particle.hue}, 80%, 72%, ${0.18 * display})`
        ctx.lineWidth = particle.size * dpr
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(px, py, particle.size * dpr, 0, Math.PI * 2)
        ctx.fillStyle = `hsla(${particle.hue}, 90%, 78%, ${0.28 * display})`
        ctx.fill()
      }

      const core = 16 + display * 52 + Math.sin(t * 3.1) * 5
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, core * 6.4)
      glow.addColorStop(0, `rgba(190, 255, 245, ${0.18 + display * 0.38})`)
      glow.addColorStop(0.28, `rgba(34, 180, 210, ${0.16 * display})`)
      glow.addColorStop(1, "rgba(4, 8, 13, 0)")
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(cx, cy, core * 6.4, 0, Math.PI * 2)
      ctx.fill()

      if (ripple > 0.02) {
        ctx.beginPath()
        ctx.ellipse(cx, cy, ripple * width * 0.42, ripple * height * 0.3, 0, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(186, 250, 241, ${0.32 * (1 - ripple)})`
        ctx.lineWidth = 3 * dpr
        ctx.stroke()
      }

      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)

    return () => {
      running = false
      cancelAnimationFrame(frame)
      window.removeEventListener("resize", resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 z-[3] h-full w-full"
      aria-hidden="true"
    />
  )
}
