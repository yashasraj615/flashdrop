"use client"

import { useEffect, useState } from "react"
import { DownloadIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

export function InstallPrompt() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
    if (standalone) {
      setInstalled(true)
      return
    }
    const onPrompt = (incoming: Event) => {
      incoming.preventDefault()
      setEvent(incoming as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setEvent(null)
    }
    window.addEventListener("beforeinstallprompt", onPrompt)
    window.addEventListener("appinstalled", onInstalled)
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt)
      window.removeEventListener("appinstalled", onInstalled)
    }
  }, [])

  if (installed || !event) return null

  return (
    <div className="fixed top-4 right-4 z-30">
      <Button
        size="sm"
        variant="secondary"
        className="h-9 rounded-full border border-white/10 bg-white/8 text-xs backdrop-blur-xl"
        onClick={async () => {
          await event.prompt()
          await event.userChoice
          setEvent(null)
        }}
      >
        <DownloadIcon data-icon="inline-start" />
        Install app
      </Button>
    </div>
  )
}
