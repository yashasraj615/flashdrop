"use client"

import { useEffect, useState } from "react"
import { WifiOffIcon } from "lucide-react"

export function OfflineBanner() {
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine)
    update()
    window.addEventListener("online", update)
    window.addEventListener("offline", update)
    return () => {
      window.removeEventListener("online", update)
      window.removeEventListener("offline", update)
    }
  }, [])

  if (!offline) return null

  return (
    <div className="fixed inset-x-0 bottom-4 z-40 px-4">
      <div className="mx-auto flex max-w-lg items-start gap-3 rounded-2xl border border-white/10 bg-[#12141f]/80 px-4 py-3 text-sm shadow-2xl backdrop-blur-xl">
        <WifiOffIcon className="mt-0.5 size-4 shrink-0 text-amber-200/80" aria-hidden="true" />
        <div>
          <p className="font-medium">You&apos;re offline</p>
          <p className="mt-1 text-white/60">Connect to the internet to upload or download files.</p>
        </div>
      </div>
    </div>
  )
}
