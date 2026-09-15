"use client"

import { motion, useReducedMotion } from "motion/react"
import { AlertCircleIcon } from "lucide-react"

import { MagneticButton } from "@/components/magnetic-button"
import { formatBytes } from "@/lib/format"
import { cn } from "@/lib/utils"

export function Notice({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
}) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-amber-200/16 bg-[oklch(0.28_0.04_75_/_0.28)] px-4 py-3 text-left backdrop-blur-md"
    >
      <div className="flex items-start gap-3">
        <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-amber-200/80" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          {actionLabel && onAction ? (
            <MagneticButton variant="ghost" size="sm" className="mt-2 h-8 px-2" onClick={onAction}>
              {actionLabel}
            </MagneticButton>
          ) : null}
        </div>
      </div>
    </motion.div>
  )
}

export function QuotaHint({
  remaining,
  used,
  limit,
}: {
  remaining: number
  used: number
  limit: number
}) {
  const ratio = limit > 0 ? Math.min(1, used / limit) : 0
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{formatBytes(used)} / {formatBytes(limit)}</span>
        <span>{formatBytes(remaining)} left</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
        <div
          className={cn("h-full rounded-full bg-primary/80 transition-[width] duration-300")}
          style={{ width: `${used === 0 ? 0 : Math.max(4, ratio * 100)}%` }}
        />
      </div>
    </div>
  )
}
