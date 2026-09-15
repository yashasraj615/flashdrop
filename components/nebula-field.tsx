"use client"

import { useEffect, useRef } from "react"

export function NebulaField() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let frame = 0
    let running = true
    const started = performance.now()
    const mobile = window.matchMedia("(max-width: 768px)").matches

    const resize = () => {
      const dpr = mobile ? 1 : Math.min(1.25, window.devicePixelRatio || 1)
      canvas.width = Math.max(1, Math.floor(canvas.clientWidth * dpr))
      canvas.height = Math.max(1, Math.floor(canvas.clientHeight * dpr))
    }
    resize()
    window.addEventListener("resize", resize)

    const blobs = [
      { x: 0.5, y: 0.18, r: 0.42, color: "88, 64, 210", ox: 0.018, oy: 0.012 },
      { x: 0.78, y: 0.62, r: 0.34, color: "0, 170, 220", ox: -0.016, oy: 0.014 },
      { x: 0.2, y: 0.78, r: 0.36, color: "210, 40, 160", ox: 0.012, oy: -0.018 },
      { x: 0.42, y: 0.48, r: 0.22, color: "120, 90, 255", ox: -0.01, oy: 0.01 },
    ]

    const draw = (now: number) => {
      if (!running) return
      if (document.hidden) {
        frame = requestAnimationFrame(draw)
        return
      }
      const t = reduce ? 0 : (now - started) / 1000
      const width = canvas.width
      const height = canvas.height
      ctx.clearRect(0, 0, width, height)
      ctx.globalCompositeOperation = "lighter"
      for (const blob of blobs) {
        const x = (blob.x + Math.sin(t * 0.18 + blob.ox * 40) * blob.ox) * width
        const y = (blob.y + Math.cos(t * 0.14 + blob.oy * 40) * blob.oy) * height
        const radius = blob.r * Math.max(width, height)
        const glow = ctx.createRadialGradient(x, y, 0, x, y, radius)
        glow.addColorStop(0, `rgba(${blob.color}, 0.28)`)
        glow.addColorStop(0.45, `rgba(${blob.color}, 0.08)`)
        glow.addColorStop(1, "rgba(0,0,0,0)")
        ctx.fillStyle = glow
        ctx.beginPath()
        ctx.arc(x, y, radius, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalCompositeOperation = "source-over"
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
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
    />
  )
}
