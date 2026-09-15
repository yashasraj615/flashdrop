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
      src="/icons/icon-192.png"
      alt=""
      width={size}
      height={size}
      className={cn("rounded-[22%] object-cover", className)}
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
      <BrandMark className="size-8 sm:size-9" size={72} />
      {compact ? null : (
        <span className="font-heading text-[15px] tracking-tight">{APP_NAME}</span>
      )}
    </Link>
  )
}

export function SiteHeader() {
  return (
    <header className="flex items-center justify-between px-1 py-4">
      <Logo />
      <p className="hidden text-xs text-muted-foreground sm:block">Available for 24 hours</p>
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
