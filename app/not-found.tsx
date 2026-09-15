import { TransferUnavailable } from "@/components/download-view"
import { SiteShell } from "@/components/site-shell"

export default function NotFound() {
  return (
    <SiteShell>
      <div className="pt-10">
        <TransferUnavailable
          title="This page doesn't exist."
          description="Check the link and try again, or send a new file."
        />
      </div>
    </SiteShell>
  )
}
