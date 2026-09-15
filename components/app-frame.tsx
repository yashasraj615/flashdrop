"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

import { GhostCursor } from "@/components/react-bits/ghost-cursor"
import { SilkBackground } from "@/components/react-bits/silk"
import { Logo } from "@/components/site-shell"
import { InstallPrompt } from "@/components/install-prompt"
import { OfflineBanner } from "@/components/offline-banner"
import { APP_NAME } from "@/lib/constants"

export function AppFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate min-h-dvh overflow-x-hidden">
      <div className="fixed inset-0 -z-10 bg-[#090b14]">
        <SilkBackground />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,transparent,rgba(8,10,18,0.55))]" />
      </div>
      <GhostCursor />
      <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 pb-16 sm:max-w-xl sm:px-6">
        <header className="flex items-center justify-between py-5">
          <Logo />
          <p className="hidden text-xs tracking-wide text-white/50 uppercase sm:block">
            24-hour transfers
          </p>
        </header>
        <main className="flex flex-1 flex-col">{children}</main>
        <footer className="mt-10 flex items-center justify-between text-xs text-white/40">
          <span>{APP_NAME}</span>
          <Link href="/" className="hover:text-white/70">
            New transfer
          </Link>
        </footer>
      </div>
      <InstallPrompt />
      <OfflineBanner />
    </div>
  )
}
