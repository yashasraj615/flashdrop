"use client"

import { useEffect, useState } from "react"

export function GhostCursor() {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)").matches
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (!fine || reduce) return
    setEnabled(true)

    const cursor = document.createElement("div")
    cursor.className = "flashdrop-ghost-cursor"
    const ring = document.createElement("div")
    ring.className = "flashdrop-ghost-ring"
    const envelope = document.createElement("div")
    envelope.className = "flashdrop-ghost-envelope"
    cursor.append(ring, envelope)
    document.body.appendChild(cursor)
    document.documentElement.classList.add("has-ghost-cursor")

    let x = window.innerWidth / 2
    let y = window.innerHeight / 2
    let tx = x
    let ty = y
    let envMix = 0
    let attached = 0
    let frame = 0
    let visible = false
    let pressed = 0

    function insidePanel(px: number, py: number) {
      return [...document.querySelectorAll("[data-glass-panel], [data-slot='dialog-content']")].some((node) => {
        const rect = (node as HTMLElement).getBoundingClientRect()
        return px >= rect.left && px <= rect.right && py >= rect.top && py <= rect.bottom
      })
    }

    function nearestMagnet(px: number, py: number) {
      let best: { el: HTMLElement; cx: number; cy: number; w: number; h: number; dist: number; radius: number } | null =
        null
      for (const node of document.querySelectorAll("[data-magnetic]")) {
        const el = node as HTMLElement
        if (el.getAttribute("disabled") !== null) continue
        const rect = el.getBoundingClientRect()
        const cx = rect.left + rect.width / 2
        const cy = rect.top + rect.height / 2
        const dist = Math.hypot(px - cx, py - cy)
        const radius = Math.max(rect.width, rect.height) * 0.62 + 26
        if (dist < radius && (!best || dist < best.dist)) {
          best = { el, cx, cy, w: rect.width, h: rect.height, dist, radius }
        }
      }
      return best
    }

    const move = (event: PointerEvent) => {
      tx = event.clientX
      ty = event.clientY
      visible = true
    }
    const leave = () => {
      visible = false
    }
    const down = () => {
      pressed = 1
    }
    const up = () => {
      pressed = 0
    }

    const tick = () => {
      const targetEnv = insidePanel(tx, ty) ? 1 : 0
      envMix += (targetEnv - envMix) * 0.14
      document.documentElement.dataset.pointerEnv = envMix.toFixed(3)

      const magnet = envMix > 0.35 ? nearestMagnet(tx, ty) : null
      let ax = tx
      let ay = ty
      let attach = 0
      if (magnet) {
        const strength = 1 - Math.min(1, magnet.dist / magnet.radius)
        ax += (magnet.cx - tx) * strength * 0.28
        ay += (magnet.cy - ty) * strength * 0.28
        attach = strength
        magnet.el.dataset.magnetActive = strength > 0.35 ? "true" : "false"
      }
      for (const node of document.querySelectorAll("[data-magnetic]")) {
        if (node !== magnet?.el) delete (node as HTMLElement).dataset.magnetActive
      }

      x += (ax - x) * (0.18 + attach * 0.16)
      y += (ay - y) * (0.18 + attach * 0.16)
      attached += (attach - attached) * 0.18

      cursor.style.transform = `translate3d(${x}px, ${y}px, 0)`
      cursor.style.opacity = visible ? String(0.16 + envMix * 0.84) : "0"

      const ringScale = (1 - attached * 0.55) * (pressed ? 0.86 : 1)
      ring.style.opacity = String(1 - attached)
      ring.style.transform = `translate(-50%, -50%) scale(${ringScale})`

      if (magnet && attached > 0.2) {
        const pad = 10
        envelope.style.opacity = String(Math.min(1, attached * 1.35))
        envelope.style.width = `${magnet.w + pad}px`
        envelope.style.height = `${magnet.h + pad}px`
        envelope.style.borderRadius = getComputedStyle(magnet.el).borderRadius || "18px"
        envelope.style.transform = `translate(-50%, -50%) scale(${pressed ? 0.96 : 1})`
      } else {
        envelope.style.opacity = "0"
        envelope.style.transform = "translate(-50%, -50%) scale(0.86)"
      }

      frame = requestAnimationFrame(tick)
    }

    window.addEventListener("pointermove", move, { passive: true })
    window.addEventListener("pointerleave", leave)
    window.addEventListener("pointerdown", down)
    window.addEventListener("pointerup", up)
    frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerleave", leave)
      window.removeEventListener("pointerdown", down)
      window.removeEventListener("pointerup", up)
      cursor.remove()
      document.documentElement.classList.remove("has-ghost-cursor")
      delete document.documentElement.dataset.pointerEnv
    }
  }, [])

  if (!enabled) return null
  return null
}
