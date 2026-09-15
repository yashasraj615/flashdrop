import { AppFrame } from "@/components/app-frame"
import { TransferExperience } from "@/components/transfer-experience"
import { isPlausibleToken } from "@/lib/token-format"

export const dynamic = "force-dynamic"

export default async function TransferPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
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
