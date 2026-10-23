import { AppFrame } from "@/components/app-frame"
import { WideConnect } from "@/components/wide-connect"
export const metadata = {
  title: "Wide Connect",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
}
export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return (
    <AppFrame>
      <div className="mx-auto w-full max-w-3xl">
        <WideConnect token={token} />
      </div>
    </AppFrame>
  )
}
