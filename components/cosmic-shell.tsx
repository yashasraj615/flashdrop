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
      <InstallPrompt />
      <OfflineBanner />
    </AtmosphereProvider>
  )
}
