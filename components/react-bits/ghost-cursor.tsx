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
    let envW = 22
    let envH = 22
    let envRadius = 11
    let frame = 0
    let visible = false
    let pressed = 0

    function insidePanel(px: number, py: number) {
      return [...document.querySelectorAll("[data-glass-panel], [data-slot='dialog-content']")].some((node) => {
        const rect = (node as HTMLElement).getBoundingClientRect()
        return px >= rect.left && px <= rect.right && py >= rect.top && py <= rect.bottom
      })
    }

    function pointInRect(px: number, py: number, rect: DOMRect) {
      return px >= rect.left && px <= rect.right && py >= rect.top && py <= rect.bottom
    }

    function hoveredControl(px: number, py: number) {
      let best: { el: HTMLElement; cx: number; cy: number; w: number; h: number; radius: number } | null = null
      let bestArea = Infinity
      for (const node of document.querySelectorAll("[data-magnetic]")) {
        const el = node as HTMLElement
        if (el.getAttribute("disabled") !== null) continue
        const rect = el.getBoundingClientRect()
        if (!pointInRect(px, py, rect)) continue
        const area = rect.width * rect.height
        if (area < bestArea) {
          bestArea = area
          const parsed = Number.parseFloat(getComputedStyle(el).borderRadius || "18")
          best = {
            el,
            cx: rect.left + rect.width / 2,
            cy: rect.top + rect.height / 2,
            w: rect.width,
            h: rect.height,
            radius: Number.isFinite(parsed) ? parsed : 18,
          }
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
      envMix += (targetEnv - envMix) * 0.22
      document.documentElement.dataset.pointerEnv = envMix.toFixed(3)

      const hover = hoveredControl(tx, ty)

      if (hover) {
        x = hover.cx
        y = hover.cy
        attached = 1
        hover.el.dataset.magnetActive = "true"
      } else {
        x += (tx - x) * 0.38
        y += (ty - y) * 0.38
        attached += (0 - attached) * 0.42
      }
      for (const node of document.querySelectorAll("[data-magnetic]")) {
        if (node !== hover?.el) delete (node as HTMLElement).dataset.magnetActive
      }

      cursor.style.transform = `translate3d(${x}px, ${y}px, 0)`
      cursor.style.opacity = visible ? "1" : "0"

      const ringScale = (1 - attached * 0.85) * (pressed ? 0.92 : 1)
      ring.style.opacity = hover ? "0" : "1"
      ring.style.transform = `translate(-50%, -50%) scale(${ringScale})`

      const targetW = hover ? hover.w + 10 : 22
      const targetH = hover ? hover.h + 10 : 22
      const targetRadius = hover ? hover.radius : 11
      if (hover) {
        envW = targetW
        envH = targetH
        envRadius = targetRadius
      } else {
        envW += (targetW - envW) * 0.48
        envH += (targetH - envH) * 0.48
        envRadius += (targetRadius - envRadius) * 0.48
      }
      envelope.style.width = `${envW}px`
      envelope.style.height = `${envH}px`
      envelope.style.borderRadius = `${envRadius}px`
      envelope.style.background = "transparent"
      envelope.style.backdropFilter = "none"
      envelope.style.setProperty("-webkit-backdrop-filter", "none")
      envelope.style.opacity = hover ? "1" : "0"
      envelope.style.transform = `translate(-50%, -50%) scale(${pressed && hover ? 0.98 : 1})`

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
