"use client"
import { useState } from "react"
import { MagneticButton } from "@/components/magnetic-button"
import { QrImage } from "@/components/qr-image"
export function ShareTools({ url }: { url: string }) {
  const [qr, setQr] = useState(false),
    [message, setMessage] = useState("")
  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setMessage("Link copied")
    } catch {
      setMessage("Select and copy the link below.")
    }
  }
  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: "Flashdrop", url })
      else await copy()
    } catch (e) {
      if ((e as Error).name !== "AbortError")
        setMessage("Use Copy link or select the URL below.")
    }
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <MagneticButton onClick={copy}>Copy link</MagneticButton>
        <MagneticButton variant="secondary" onClick={share}>
          Share
        </MagneticButton>
        <MagneticButton
          variant="outline"
          onClick={() => setQr(!qr)}
          aria-expanded={qr}
        >
          {qr ? "Hide QR code" : "Show QR Code"}
        </MagneticButton>
      </div>
      <input
        aria-label="Share link"
        className="mode-input w-full text-xs"
        readOnly
        value={url}
        onFocus={(e) => e.target.select()}
      />
      <p role="status" className="text-sm text-primary">
        {message}
      </p>
      {qr && (
        <div className="w-fit max-w-full rounded-2xl bg-white p-4">
          <QrImage value={url} size={220} />
        </div>
      )}
    </div>
  )
}
