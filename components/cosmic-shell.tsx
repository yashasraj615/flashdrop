"use client"

import { AtmosphereProvider } from "@/components/atmosphere"
import { CosmicEnvironment } from "@/components/cosmic-environment"
import { GhostCursor } from "@/components/react-bits/ghost-cursor"
import { InstallPrompt } from "@/components/install-prompt"
import { OfflineBanner } from "@/components/offline-banner"

export function CosmicShell({ children }: { children: React.ReactNode }) {
  return (
    <AtmosphereProvider>
      <CosmicEnvironment />
      <GhostCursor />
      {children}
      <a
        href="https://github.com/yashasraj615"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed right-4 bottom-3 z-30 text-[11px] tracking-wide text-white/38 transition-colors hover:text-white/70"
      >
        Made by <span className="underline decoration-white/20 underline-offset-2">Yashas Raj S</span>
      </a>
      <InstallPrompt />
      <OfflineBanner />
    </AtmosphereProvider>
  )
}
