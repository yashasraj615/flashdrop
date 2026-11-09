import Link from "next/link"

import { APP_NAME } from "@/lib/constants"
import { cn } from "@/lib/utils"

export function BrandMark({
  className,
  size = 36,
}: {
  className?: string
  size?: number
}) {
  return (
    <img
      src="/brand/flashdrop-logo.png"
      srcSet="/icons/icon-192.png 1x, /icons/icon-512.png 2x, /brand/flashdrop-logo.png 3x"
      alt=""
      width={size}
      height={size}
      className={cn(
        "rounded-[22%] object-contain shadow-[0_0_14px_#4de6df18] ring-1 ring-cyan-200/15",
        className
      )}
      draggable={false}
    />
  )
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-2.5 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`${APP_NAME} home`}
    >
      <BrandMark className="size-10 sm:size-11" size={88} />
      {compact ? null : (
        <span className="font-heading text-[17px] font-medium tracking-tight">
          {APP_NAME}
        </span>
      )}
    </Link>
  )
}

export function SiteHeader() {
  return (
    <header className="flex items-center justify-between px-1 py-4">
      <Logo />
      <p className="hidden text-xs text-muted-foreground sm:block">
        Available for up to 5 hours
      </p>
    </header>
  )
}

export function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="atmosphere relative flex min-h-dvh flex-col items-center overflow-x-hidden">
      <div className="flex w-full max-w-xl flex-col px-4 pb-16 sm:px-6 lg:max-w-2xl">
        <SiteHeader />
        <main className="flex w-full flex-1 flex-col">{children}</main>
      </div>
    </div>
  )
}
