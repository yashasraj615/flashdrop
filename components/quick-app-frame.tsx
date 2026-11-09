"use client"

import { createContext, useState } from "react"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"

import { BrandMark, Logo } from "@/components/site-shell"
import { APP_NAME } from "@/lib/constants"

export const QuickBusyContext = createContext<(busy: boolean) => void>(() => {})

export function QuickAppFrame({
  children,
  onBack,
  backDisabled = false,
}: {
  children: React.ReactNode
  onBack?: () => void
  backDisabled?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const blocked = busy || backDisabled
  return (
    <QuickBusyContext.Provider value={setBusy}>
      <div className="quick-transfer-original relative isolate min-h-dvh overflow-x-hidden">
        <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 pb-20 sm:max-w-xl sm:px-6">
          <header className="flex items-center justify-between py-5">
            <Logo />
            <p className="text-xs tracking-wide text-white/50 uppercase">
              Up to 5 hours
            </p>
          </header>
          <main className="flex flex-1 flex-col">
            {onBack ? (
              <button
                className="mb-5 inline-flex min-h-10 w-fit items-center gap-2 rounded-lg px-2 text-sm text-white/65 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-35"
                disabled={blocked}
                title={
                  blocked
                    ? "Finish or cancel the upload before leaving"
                    : undefined
                }
                onClick={onBack}
              >
                <ArrowLeft size={16} />
                All transfer modes
              </button>
            ) : (
              <Link
                href="/"
                aria-disabled={blocked}
                onClick={(event) => {
                  if (blocked) event.preventDefault()
                }}
                className="mb-5 inline-flex min-h-10 w-fit items-center gap-2 rounded-lg px-2 text-sm text-white/65 hover:text-white"
              >
                <ArrowLeft size={16} />
                All transfer modes
              </Link>
            )}
            {children}
          </main>
          <footer className="mt-10 flex items-center justify-between text-xs text-white/40">
            <span className="inline-flex items-center gap-2">
              <BrandMark className="size-5" size={40} />
              {APP_NAME}
            </span>
            <Link
              href="/"
              data-magnetic
              className="magnet-control rounded-full px-3 py-2 hover:text-white/70"
            >
              New transfer
            </Link>
          </footer>
        </div>
      </div>
    </QuickBusyContext.Provider>
  )
}
