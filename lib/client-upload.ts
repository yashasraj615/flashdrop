import {
  ENCRYPTION_CHUNK_BYTES,
  PART_SIZE_BYTES,
  UPLOAD_CONCURRENCY,
  chunkCount,
  encryptedSize,
} from "@/lib/constants"
import { deriveFileKey, encryptFileChunk } from "@/lib/client-crypto"

export type UploadFilePlan = {
  id: string
  filename: string
  mimeType: string
  size: number
  encryptedSize: number
  chunkSize: number
  mode: "put" | "multipart"
  partCount: number
  uploadUrl?: string
}

export type TransferInitResponse = {
  token: string
  manageToken: string
  files: UploadFilePlan[]
  error?: string
  remaining?: number
}

function putWithProgress(
  url: string,
  body: Blob | Uint8Array,
  contentType: string | undefined,
  onProgress: (loaded: number) => void,
  signal: AbortSignal
) {
  return new Promise<string | null>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("PUT", url)
    if (contentType) xhr.setRequestHeader("Content-Type", contentType)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded)
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.getResponseHeader("ETag"))
        return
      }
      reject(new Error("Upload couldn't be completed."))
    }
    xhr.onerror = () => reject(new Error("Upload couldn't be completed."))
    xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"))
    const onAbort = () => xhr.abort()
    signal.addEventListener("abort", onAbort, { once: true })
    xhr.send(body instanceof Uint8Array ? new Blob([new Uint8Array(body)]) : body)
  })
}

export async function requestTransfer(files: File[], signal: AbortSignal, lifetimeSeconds?: number) {
  const response = await fetch("/api/transfers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      lifetimeSeconds,
      files: files.map((file) => ({
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
      })),
    }),
    signal,
  })
  const data = (await response.json()) as TransferInitResponse
  if (!response.ok || !data.token) {
    const error = new Error(data.error || "We couldn't prepare your files.") as Error & {
      remaining?: number
    }
    error.remaining = data.remaining
    throw error
  }
  return data
}

export async function requestAddFiles(
  token: string,
  manageToken: string,
  files: File[],
  signal: AbortSignal
) {
  const response = await fetch(`/api/transfers/${token}/files`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-flashdrop-manage": manageToken,
    },
    body: JSON.stringify({
      manageToken,
      files: files.map((file) => ({
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
      })),
    }),
    signal,
  })
  const data = (await response.json()) as TransferInitResponse & { expiresAt?: string }
  if (!response.ok) {
    const error = new Error(data.error || "Those files couldn't be added.") as Error & {
      remaining?: number
    }
    error.remaining = data.remaining
    throw error
  }
  return data
}

export async function uploadEncryptedFiles(params: {
  token: string
  manageToken: string
  masterKey: Uint8Array
  files: File[]
  plans: UploadFilePlan[]
  signal: AbortSignal
  onProgress: (loaded: number, total: number) => void
}) {
  const total = params.plans.reduce((sum, plan) => sum + plan.encryptedSize, 0)
  let completed = 0

  for (let fileIndex = 0; fileIndex < params.plans.length; fileIndex += 1) {
    const plan = params.plans[fileIndex]
    const source = params.files[fileIndex]
    if (!plan || !source) throw new Error("Couldn't secure this file.")
    const key = await deriveFileKey(params.masterKey, plan.id)
    const chunks = chunkCount(source.size, plan.chunkSize || ENCRYPTION_CHUNK_BYTES)
    const parts: { partNumber: number; etag: string }[] = []
    const partLoaded: Record<number, number> = {}

    async function uploadPart(index: number) {
      const packed = await encryptFileChunk(source, key, plan.id, index, plan.chunkSize)
      let url = plan.uploadUrl
      if (plan.mode === "multipart") {
        const urlResponse = await fetch(
          `/api/transfers/${params.token}/files/${plan.id}/part-url`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-flashdrop-manage": params.manageToken,
            },
            body: JSON.stringify({ partNumber: index + 1, manageToken: params.manageToken }),
            signal: params.signal,
          }
        )
        const urlData = (await urlResponse.json()) as { url?: string; error?: string }
        if (!urlResponse.ok || !urlData.url) {
          throw new Error(urlData.error || "Upload couldn't be completed.")
        }
        url = urlData.url
      }
      if (!url) throw new Error("We couldn't prepare your files.")
      const etag = await putWithProgress(
        url,
        packed,
        plan.mode === "put" ? "application/octet-stream" : undefined,
        (loaded) => {
          partLoaded[index] = loaded
          const current = Object.values(partLoaded).reduce((sum, value) => sum + value, 0)
          params.onProgress(completed + current, total)
        },
        params.signal
      )
      if (plan.mode === "multipart") {
        parts.push({ partNumber: index + 1, etag: etag || `part-${index + 1}` })
      }
    }

    if (plan.mode === "put") {
      await uploadPart(0)
    } else {
      let next = 0
      const workers = Array.from({ length: Math.min(UPLOAD_CONCURRENCY, chunks) }, async () => {
        while (!params.signal.aborted) {
          const index = next
          next += 1
          if (index >= chunks) return
          await uploadPart(index)
        }
      })
      await Promise.all(workers)
    }

    const completeResponse = await fetch(
      `/api/transfers/${params.token}/files/${plan.id}/complete`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-flashdrop-manage": params.manageToken,
        },
        body: JSON.stringify({ parts, manageToken: params.manageToken }),
        signal: params.signal,
      }
    )
    const completeData = (await completeResponse.json()) as { error?: string }
    if (!completeResponse.ok) {
      throw new Error(completeData.error || "Upload couldn't be completed.")
    }
        completed += plan.encryptedSize || encryptedSize(source.size)
    params.onProgress(completed, total)
  }
}

export async function abortFile(token: string, manageToken: string, fileId: string) {
  await fetch(`/api/transfers/${token}/files/${fileId}/abort`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-flashdrop-manage": manageToken,
    },
    body: JSON.stringify({ manageToken }),
  }).catch(() => undefined)
}

void PART_SIZE_BYTES
