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
    cursor.appendChild(ring)
    document.body.appendChild(cursor)
    document.documentElement.classList.add("has-ghost-cursor")

    let x = window.innerWidth / 2
    let y = window.innerHeight / 2
    let tx = x
    let ty = y
    let frame = 0
    let visible = false

    const move = (event: PointerEvent) => {
      tx = event.clientX
      ty = event.clientY
      visible = true
      cursor.style.opacity = "1"
    }
    const leave = () => {
      visible = false
      cursor.style.opacity = "0"
    }

    const tick = () => {
      x += (tx - x) * 0.22
      y += (ty - y) * 0.22
      cursor.style.transform = `translate3d(${x}px, ${y}px, 0)`
      ring.style.transform = `translate(-50%, -50%) scale(${visible ? 1 : 0.6})`
      frame = requestAnimationFrame(tick)
    }

    window.addEventListener("pointermove", move, { passive: true })
    window.addEventListener("pointerleave", leave)
    frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerleave", leave)
      cursor.remove()
      document.documentElement.classList.remove("has-ghost-cursor")
    }
  }, [])

  if (!enabled) return null
  return null
}
