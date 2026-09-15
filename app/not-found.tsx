import { AppFrame } from "@/components/app-frame"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export default function NotFound() {
  return (
    <AppFrame>
      <div className="mx-auto w-full max-w-xl pt-10">
        <div className="glass-panel rounded-[32px] p-8 text-center">
          <h1 className="font-heading text-3xl tracking-tight">This transfer isn&apos;t available</h1>
          <p className="mt-3 text-sm text-white/60">The link may have expired or may no longer exist.</p>
          <a href="/" className={cn(buttonVariants(), "mt-6 inline-flex h-12")}>
            Create new transfer
          </a>
        </div>
      </div>
    </AppFrame>
  )
}
