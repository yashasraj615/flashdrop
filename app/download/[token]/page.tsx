import type { Metadata } from "next"

import { DownloadView, TransferUnavailable } from "@/components/download-view"
import { SiteShell } from "@/components/site-shell"
import { getFileByToken, publicFileStatus } from "@/lib/files"
import { isPlausibleToken } from "@/lib/tokens"

export const dynamic = "force-dynamic"

type PageProps = {
  params: Promise<{ token: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params
  if (!isPlausibleToken(token)) {
    return { title: "Transfer unavailable" }
  }
  try {
    const file = await getFileByToken(token)
    if (!file || publicFileStatus(file) !== "active") {
      return { title: "Transfer unavailable" }
    }
    return { title: file.originalFilename }
  } catch {
    return { title: "Transfer unavailable" }
  }
}

export default async function DownloadPage({ params }: PageProps) {
  const { token } = await params

  if (!isPlausibleToken(token)) {
    return (
      <SiteShell>
        <div className="pt-10">
          <TransferUnavailable
            title="This transfer link isn't valid."
            description="The link may be incomplete or was never created."
          />
        </div>
      </SiteShell>
    )
  }

  let file = null
  try {
    file = await getFileByToken(token)
  } catch {
    return (
      <SiteShell>
        <div className="pt-10">
          <TransferUnavailable
            title="We couldn't prepare your file."
            description="Please try again in a moment."
          />
        </div>
      </SiteShell>
    )
  }

  if (!file || publicFileStatus(file) !== "active" || !file.expiresAt) {
    return (
      <SiteShell>
        <div className="pt-10">
          <TransferUnavailable
            title="This file has expired."
            description="Files are available for 24 hours after upload."
          />
        </div>
      </SiteShell>
    )
  }

  return (
    <SiteShell>
      <div className="pt-10">
        <DownloadView
          token={file.token}
          filename={file.originalFilename}
          mimeType={file.mimeType}
          size={file.fileSize}
          expiresAt={file.expiresAt}
        />
      </div>
    </SiteShell>
  )
}
