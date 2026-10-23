"use client"

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"

import { useAtmosphere } from "@/components/atmosphere"
import { NebulaField } from "@/components/nebula-field"
import { SpaceTunnel } from "@/components/space-tunnel"
import { cn } from "@/lib/utils"

const SplashCursor = dynamic(
  () => import("@/components/react-bits/splash-cursor"),
  {
    ssr: false,
  }
)
const Ballpit = dynamic(() => import("@/components/react-bits/ballpit"), {
  ssr: false,
})

export function CosmicEnvironment() {
  const { scene } = useAtmosphere()
  const [enabled, setEnabled] = useState({
    splash: false,
    balls: false,
    count: 36,
    drift: true,
  })

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)")
    const pointer = window.matchMedia("(pointer: coarse)")
    const size = window.matchMedia("(max-width: 768px)")
    const update = () => {
      const low =
        navigator.hardwareConcurrency <= 4 ||
        (navigator as Navigator & { deviceMemory?: number }).deviceMemory! <= 4
      setEnabled({
        splash: !motion.matches && !pointer.matches && !low && !size.matches,
        balls: !motion.matches,
        count: low || size.matches ? 18 : pointer.matches ? 28 : 48,
        drift: !motion.matches,
      })
    }
    update()
    for (const query of [motion, pointer, size])
      query.addEventListener("change", update)
    return () => {
      for (const query of [motion, pointer, size])
        query.removeEventListener("change", update)
    }
  }, [])

  const intense = scene === "uploading" || scene === "completing"
  const dropIn = scene === "completing" || scene === "ready"
  const playful = scene === "ready"

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#04080d]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,#083344_0%,#07131c_40%,#04080d_74%)]" />
      <NebulaField />
      {enabled.drift ? (
        <div className="cosmic-drift" aria-hidden="true" />
      ) : null}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_16%,rgba(34,211,238,0.16),transparent_44%),radial-gradient(circle_at_82%_72%,rgba(56,189,248,0.14),transparent_38%),radial-gradient(circle_at_16%_84%,rgba(52,211,153,0.12),transparent_34%)]" />
      {enabled.splash ? (
        <div className="absolute inset-0 opacity-[0.72] mix-blend-screen">
          <SplashCursor />
        </div>
      ) : null}
      <SpaceTunnel />
      {enabled.balls ? (
        <div
          className={cn(
            "absolute inset-x-0 transition-[opacity,height,bottom] duration-700",
            dropIn ? "inset-0 h-full opacity-90" : "bottom-0 h-[48vh]",
            intense && !dropIn ? "opacity-35" : null,
            !dropIn && !intense ? "opacity-80" : null
          )}
          style={
            dropIn
              ? undefined
              : {
                  maskImage:
                    "linear-gradient(to top, black 46%, transparent 100%)",
                  WebkitMaskImage:
                    "linear-gradient(to top, black 46%, transparent 100%)",
                }
          }
        >
          <Ballpit
            className="h-full w-full"
            playful={playful}
            dropIn={dropIn}
            count={enabled.count}
            gravity={0.022}
            friction={0.996}
            wallBounce={0.92}
            maxVelocity={0.07}
            minSize={0.26}
            maxSize={0.68}
            size0={0.32}
            colors={[0x22d3ee, 0x2dd4bf, 0x5eead4, 0x38bdf8]}
            ambientColor={0x082f2e}
            ambientIntensity={0.5}
            lightIntensity={72}
          />
        </div>
      ) : null}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_16%,rgba(4,8,13,0.5)_100%)]" />
    </div>
  )
}
