"use client"
import { useEffect } from "react"
export function GhostCursor() {
  useEffect(() => {
    const media = matchMedia(
      "(pointer: fine) and (prefers-reduced-motion: no-preference)"
    )
    const cursor = document.createElement("div"),
      ring = document.createElement("div"),
      frame = document.createElement("div")
    cursor.className = "flashdrop-ghost-cursor"
    ring.className = "flashdrop-ghost-ring"
    frame.className = "flashdrop-ghost-envelope"
    cursor.append(ring, frame)
    document.body.append(cursor)
    let x = 0,
      y = 0,
      visible = false,
      raf = 0,
      attached: HTMLElement | null = null
    const detach = () => {
      if (attached) delete attached.dataset.magnetActive
      attached = null
    }
    const hide = () => {
      visible = false
      cursor.style.opacity = "0"
      document.documentElement.classList.remove("has-ghost-cursor")
      detach()
    }
    const render = () => {
      raf = 0
      if (!visible || !media.matches || document.hidden) {
        hide()
        return
      }
      // Actual hit testing, once per input frame. No expanded bounding-box hover zone.
      const target =
        document
          .elementFromPoint(x, y)
          ?.closest<HTMLElement>("[data-magnetic]") || null
      const hover =
        target && !target.matches(':disabled,[aria-disabled="true"]')
          ? target
          : null
      if (hover !== attached) {
        detach()
        attached = hover
        if (hover) hover.dataset.magnetActive = "true"
      }
      const rect = hover?.getBoundingClientRect()
      cursor.style.transform = `translate3d(${rect ? rect.left + rect.width / 2 : x}px,${rect ? rect.top + rect.height / 2 : y}px,0)`
      cursor.style.opacity = "1"
      document.documentElement.classList.add("has-ghost-cursor")
      ring.style.opacity = hover ? "0" : "1"
      ring.style.transform = "translate(-50%,-50%)"
      frame.style.opacity = hover ? "1" : "0"
      if (rect && hover) {
        frame.style.width = `${rect.width + 8}px`
        frame.style.height = `${rect.height + 8}px`
        frame.style.borderRadius = getComputedStyle(hover).borderRadius
        frame.style.transform = "translate(-50%,-50%)"
      }
    }
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(render)
    }
    const move = (event: PointerEvent) => {
      if (event.pointerType === "touch" || !media.matches) return
      x = event.clientX
      y = event.clientY
      visible = true
      schedule()
    }
    const key = (event: KeyboardEvent) => {
      if (event.key === "Tab") hide()
    }
    const mutations = new MutationObserver(schedule)
    mutations.observe(document.body, { childList: true, subtree: true })
    window.addEventListener("pointerdown", schedule, { passive: true })
    window.addEventListener("pointerup", schedule, { passive: true })
    window.addEventListener("pointermove", move, { passive: true })
    document.addEventListener("pointerleave", hide)
    window.addEventListener("blur", hide)
    window.addEventListener("keydown", key)
    window.addEventListener("scroll", schedule, {
      passive: true,
      capture: true,
    })
    window.addEventListener("resize", schedule)
    document.addEventListener("visibilitychange", hide)
    media.addEventListener("change", hide)
    return () => {
      mutations.disconnect()
      window.removeEventListener("pointerdown", schedule)
      window.removeEventListener("pointerup", schedule)
      cancelAnimationFrame(raf)
      hide()
      cursor.remove()
      window.removeEventListener("pointermove", move)
      document.removeEventListener("pointerleave", hide)
      window.removeEventListener("blur", hide)
      window.removeEventListener("keydown", key)
      window.removeEventListener("scroll", schedule, true)
      window.removeEventListener("resize", schedule)
      document.removeEventListener("visibilitychange", hide)
      media.removeEventListener("change", hide)
    }
  }, [])
  return null
}
