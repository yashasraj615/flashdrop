"use client"

import { AppFrame } from "@/components/app-frame"
import { BrandMark } from "@/components/site-shell"

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <AppFrame>
      <div className="mx-auto w-full max-w-xl pt-10">
        <div className="glass-panel rounded-[32px] p-8 text-center">
          <BrandMark className="mx-auto size-12" size={96} />
          <h1 className="font-heading mt-5 text-3xl tracking-tight">Something went wrong</h1>
          <p className="mt-3 text-sm text-white/60">
            Please try again. Nothing from this transfer was exposed.
          </p>
          <button
            type="button"
            className="mt-6 text-sm text-primary underline-offset-4 hover:underline"
            onClick={reset}
          >
            Try again
          </button>
        </div>
      </div>
    </AppFrame>
  )
}
