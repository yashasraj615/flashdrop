"use client"

import Link from "next/link"

import { BrandMark, Logo } from "@/components/site-shell"
import { APP_NAME } from "@/lib/constants"

export function AppFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate min-h-dvh overflow-x-hidden">
      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 pb-20 sm:max-w-xl sm:px-6">
        <header className="flex items-center justify-between py-5">
          <Logo />
          <p className="text-xs tracking-wide text-white/50 uppercase">Up to 5 hours</p>
        </header>
        <main className="flex flex-1 flex-col">{children}</main>
        <footer className="mt-10 flex items-center justify-between text-xs text-white/40">
          <span className="inline-flex items-center gap-2">
            <BrandMark className="size-5" size={40} />
            {APP_NAME}
          </span>
          <Link href="/" data-magnetic className="magnet-control rounded-full px-3 py-2 hover:text-white/70">
            New transfer
          </Link>
        </footer>
      </div>
    </div>
  )
}
