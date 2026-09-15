"use client"

import { useEffect, useState } from "react"

import { formatRemaining, remainingMs } from "@/lib/expiration"

export function Countdown({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const remaining = remainingMs(new Date(now), expiresAt)
  return (
    <span className="tabular-nums" aria-live="polite">
      {formatRemaining(remaining)}
    </span>
  )
}
