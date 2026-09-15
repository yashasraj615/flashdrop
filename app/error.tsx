"use client"

import { TransferUnavailable } from "@/components/download-view"
import { SiteShell } from "@/components/site-shell"

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <SiteShell>
      <div className="pt-10">
        <TransferUnavailable
          title="Something went wrong."
          description="Please try again. Your file was not exposed."
        />
        <div className="mt-4 text-center">
          <button type="button" className="text-sm text-primary underline-offset-4 hover:underline" onClick={reset}>
            Try again
          </button>
        </div>
      </div>
    </SiteShell>
  )
}
