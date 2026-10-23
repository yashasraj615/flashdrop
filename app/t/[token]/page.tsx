import { QuickAppFrame as AppFrame } from "@/components/quick-app-frame"
import { AppFrame as MediaFrame } from "@/components/app-frame"
import { MediaTransferExperience } from "@/components/media-transfer-experience"
import { getSql } from "@/lib/db"
import { TransferExperience } from "@/components/transfer-experience"
import { isPlausibleToken } from "@/lib/token-format"

export const dynamic = "force-dynamic"

export default async function TransferPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  if (isPlausibleToken(token)) {
    const rows =
      await getSql()`SELECT mode FROM transfers WHERE token = ${token}`
    if (rows[0]?.mode === "media")
      return (
        <MediaFrame>
          <div className="mx-auto w-full max-w-xl pt-4 sm:pt-8">
            <MediaTransferExperience token={token} mode="media" />
          </div>
        </MediaFrame>
      )
  }
  return (
    <AppFrame>
      <div className="mx-auto w-full max-w-xl pt-4 sm:pt-8">
        {isPlausibleToken(token) ? (
          <TransferExperience token={token} />
        ) : (
          <TransferExperience token="invalid" />
        )}
      </div>
    </AppFrame>
  )
}
