"use client"

import { createContext, useContext, useMemo, useState } from "react"

export type VisualScene = "idle" | "uploading" | "completing" | "ready"

type AtmosphereValue = {
  scene: VisualScene
  progress: number
  setScene: (scene: VisualScene) => void
  setProgress: (progress: number) => void
}

const AtmosphereContext = createContext<AtmosphereValue | null>(null)

export function AtmosphereProvider({ children }: { children: React.ReactNode }) {
  const [scene, setScene] = useState<VisualScene>("idle")
  const [progress, setProgress] = useState(0)
  const value = useMemo(
    () => ({ scene, progress, setScene, setProgress }),
    [scene, progress]
  )
  return <AtmosphereContext.Provider value={value}>{children}</AtmosphereContext.Provider>
}

export function useAtmosphere() {
  const value = useContext(AtmosphereContext)
  if (!value) {
    throw new Error("AtmosphereProvider is missing")
  }
  return value
}
