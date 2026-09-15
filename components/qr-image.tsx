"use client"

import { useEffect, useState } from "react"
import QRCode from "qrcode"

export function QrImage({
  value,
  size = 240,
  className,
}: {
  value: string
  size?: number
  className?: string
}) {
  const [src, setSrc] = useState<string>("")

  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(value, {
      margin: 4,
      width: size * 2,
      errorCorrectionLevel: "M",
      color: { dark: "#141820", light: "#ffffff" },
    }).then((url) => {
      if (!cancelled) setSrc(url)
    })
    return () => {
      cancelled = true
    }
  }, [value, size])

  if (!src) {
    return (
      <div
        className={className}
        style={{ width: size, height: size }}
        aria-hidden="true"
      />
    )
  }

  return (
    <img
      src={src}
      alt="QR code for this transfer link"
      width={size}
      height={size}
      className={className}
    />
  )
}

export async function downloadQrPng(value: string, filename: string) {
  const url = await QRCode.toDataURL(value, {
    margin: 4,
    width: 1024,
    errorCorrectionLevel: "H",
    color: { dark: "#141820", light: "#ffffff" },
  })
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
}
