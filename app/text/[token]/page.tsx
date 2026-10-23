import { AppFrame } from "@/components/app-frame"
import { TextPad } from "@/components/text-pad"
export const metadata = {
  title: "Text Pad",
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
      <TextPad token={token} />
    </AppFrame>
  )
}
