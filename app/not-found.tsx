import { AppFrame } from "@/components/app-frame"
import { BrandMark } from "@/components/site-shell"
import { MagneticLink } from "@/components/magnetic-button"

export default function NotFound() {
  return (
    <AppFrame>
      <div className="mx-auto w-full max-w-xl pt-10">
        <div className="glass-panel rounded-[32px] p-8 text-center">
          <BrandMark className="mx-auto size-12" size={96} />
          <h1 className="font-heading mt-5 text-3xl tracking-tight">This transfer isn&apos;t available</h1>
          <p className="mt-3 text-sm text-white/60">The link may have expired or may no longer exist.</p>
          <MagneticLink href="/" className="mt-6 h-12">
            Create new transfer
          </MagneticLink>
        </div>
      </div>
    </AppFrame>
  )
}
