import Link from "next/link"

import { APP_NAME } from "@/lib/constants"

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-2.5 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`${APP_NAME} home`}
    >
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/25">
        <svg viewBox="0 0 16 16" className="size-4 text-primary" aria-hidden="true">
          <path
            d="M9.3 1.8 4.2 8h3.6L6.6 14.2 11.8 8H8.2L9.3 1.8Z"
            fill="currentColor"
          />
        </svg>
      </span>
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
      <p className="text-xs text-muted-foreground">Available for 24 hours</p>
    </header>
  )
}

export function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="atmosphere relative min-h-dvh overflow-hidden">
      <div className="mx-auto flex w-full max-w-2xl flex-col px-4 pb-16 sm:px-6 lg:max-w-3xl">
        <SiteHeader />
        <main className="flex flex-1 flex-col">{children}</main>
      </div>
    </div>
  )
}
