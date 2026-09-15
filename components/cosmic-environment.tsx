"use client"

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"

import { useAtmosphere } from "@/components/atmosphere"
import { NebulaField } from "@/components/nebula-field"
import { SpaceTunnel } from "@/components/space-tunnel"
import { cn } from "@/lib/utils"

const SplashCursor = dynamic(() => import("@/components/react-bits/splash-cursor"), {
  ssr: false,
})
const Ballpit = dynamic(() => import("@/components/react-bits/ballpit"), {
  ssr: false,
})

export function CosmicEnvironment() {
  const { scene } = useAtmosphere()
  const [enabled, setEnabled] = useState({ splash: false, balls: false, count: 36, drift: true })

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const coarse = window.matchMedia("(pointer: coarse)").matches
    const mobile = window.matchMedia("(max-width: 768px)").matches
    if (reduce) {
      setEnabled({ splash: false, balls: false, count: 0, drift: false })
      return
    }
    setEnabled({
      splash: !coarse,
      balls: true,
      count: mobile ? 14 : coarse ? 20 : 34,
      drift: true,
    })
  }, [])

  const intense = scene === "uploading" || scene === "completing"

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#05060f]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,#2a1b6a_0%,#0b0c1c_38%,#05060f_72%)]" />
      <NebulaField />
      {enabled.drift ? <div className="cosmic-drift" aria-hidden="true" /> : null}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_16%,rgba(126,88,255,0.28),transparent_44%),radial-gradient(circle_at_82%_72%,rgba(0,214,255,0.14),transparent_38%),radial-gradient(circle_at_16%_84%,rgba(255,64,196,0.16),transparent_34%)]" />
      {enabled.splash ? (
        <div className="absolute inset-0 mix-blend-screen opacity-[0.72]">
          <SplashCursor />
        </div>
      ) : null}
      <SpaceTunnel />
      {enabled.balls ? (
        <div
          className={cn(
            "absolute inset-x-0 bottom-0 h-[48vh] transition-opacity duration-700",
            intense ? "opacity-35" : "opacity-85"
          )}
          style={{
            maskImage: "linear-gradient(to top, black 46%, transparent 100%)",
            WebkitMaskImage: "linear-gradient(to top, black 46%, transparent 100%)",
          }}
        >
          <Ballpit
            className="h-full w-full"
            followCursor={false}
            count={enabled.count}
            gravity={0}
            friction={0.9978}
            wallBounce={0.94}
            maxVelocity={0.055}
            minSize={0.26}
            maxSize={0.68}
            size0={0.32}
            colors={[0x7c5cff, 0xff4fd0, 0x3ee7ff, 0x5b6dff]}
            ambientColor={0x16103a}
            ambientIntensity={0.5}
            lightIntensity={72}
          />
        </div>
      ) : null}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_16%,rgba(5,6,16,0.48)_100%)]" />
    </div>
  )
}
