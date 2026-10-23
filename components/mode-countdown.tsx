"use client"

import { useEffect, useState } from "react"

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
  const [now, setNow] = useState(() =>
    serverNow ? new Date(serverNow).getTime() : 0
  )
  useEffect(() => {
    const offset = serverNow ? Date.now() - new Date(serverNow).getTime() : 0
    const id = window.setInterval(() => setNow(Date.now() - offset), 1000)
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
      {now ? label : "Calculating expiry…"}
    </span>
  )
}
