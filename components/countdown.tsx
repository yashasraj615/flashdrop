"use client"

import { useEffect, useRef, useState } from "react"

import { formatClock, formatRemaining, remainingMs } from "@/lib/expiration"
import { cn } from "@/lib/utils"

export function Countdown({
  expiresAt,
  serverNow,
  compact = false,
  urgent = false,
}: {
  expiresAt: string
  serverNow?: string
  compact?: boolean
  urgent?: boolean
}) {
  const offsetRef = useRef(0)
  if (serverNow) {
    offsetRef.current = Date.now() - new Date(serverNow).getTime()
  }
  const [now, setNow] = useState(() => Date.now() - offsetRef.current)

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now() - offsetRef.current), 250)
    return () => window.clearInterval(id)
  }, [serverNow])

  const remaining = remainingMs(new Date(now), expiresAt)
  const soon = remaining > 0 && remaining < 60_000
  const label =
    remaining <= 0
      ? "Expired"
      : soon
        ? `Expires in ${formatClock(remaining)}`
        : compact
          ? `Expires in ${formatClock(remaining)}`
          : formatRemaining(remaining)

  return (
    <span
      className={cn("tabular-nums", (urgent || soon) && "text-amber-100/90")}
      aria-live="polite"
    >
      {label}
    </span>
  )
}
