import { DecryptError, decryptChunk, deriveFileKey } from "@/lib/client-crypto"
import { encryptedChunkLength, plaintextChunkRange } from "@/lib/constants"
import { storageContentType } from "@/lib/filenames"

export type DownloadableFile = {
  id: string
  filename: string
  mimeType: string
  size: number
  encryptedSize: number
  chunkSize: number
}

class ByteReader {
  private leftover: Uint8Array[] = []
  private leftoverSize = 0

  constructor(private reader: ReadableStreamDefaultReader<Uint8Array>) {}

  close() {
    return this.reader.cancel().catch(() => undefined)
  }

  async readExact(length: number) {
    const output = new Uint8Array(length)
    let offset = 0
    while (offset < length) {
      if (!this.leftover.length) {
        const result = await this.reader.read()
        if (result.done || !result.value) throw new DecryptError()
        this.leftover.push(result.value)
        this.leftoverSize += result.value.byteLength
      }
      const next = this.leftover[0]
      if (!next) throw new DecryptError()
      const needed = length - offset
      if (next.byteLength <= needed) {
        output.set(next, offset)
        offset += next.byteLength
        this.leftover.shift()
        this.leftoverSize -= next.byteLength
      } else {
        output.set(next.subarray(0, needed), offset)
        this.leftover[0] = next.subarray(needed)
        this.leftoverSize -= needed
        offset += needed
      }
    }
    return output
  }
}

async function decryptToWritable(
  file: DownloadableFile,
  masterKey: Uint8Array,
  token: string,
  writable: { write: (data: Uint8Array) => Promise<void> }
) {
  const key = await deriveFileKey(masterKey, file.id)
  const metaResponse = await fetch(
    `/api/transfers/${token}/files/${file.id}/download`
  )
  const meta = (await metaResponse.json()) as {
    url?: string
    error?: string
    chunkSize?: number
    status?: string
  }
  if (metaResponse.status === 410 || meta.status === "expired") {
    throw new Error("This transfer has expired.")
  }
  if (!metaResponse.ok || !meta.url) {
    throw new Error(meta.error || "Download failed.")
  }

  const response = await fetch(meta.url)
  if (!response.ok || !response.body) {
    throw new Error("Download failed.")
  }

  const reader = new ByteReader(response.body.getReader())
  const chunkSize = meta.chunkSize || file.chunkSize
  async function decode(index: number) {
    const { length } = plaintextChunkRange(index, file.size, chunkSize)
    const packed = await reader.readExact(encryptedChunkLength(length))
    return decryptChunk(key, packed, file.id, index)
  }
  // One chunk of read/decryption overlaps the current disk write (bounded memory).
  let pending = file.size
    ? decode(0).then(
        (value) => ({ value }),
        (error) => ({ error })
      )
    : null
  try {
    for (let index = 0; index < Math.ceil(file.size / chunkSize); index++) {
      const result = await pending!
      if ("error" in result) throw result.error
      pending =
        index + 1 < Math.ceil(file.size / chunkSize)
          ? decode(index + 1).then(
              (value) => ({ value }),
              (error) => ({ error })
            )
          : null
      await writable.write(result.value)
    }
  } finally {
    await reader.close()
  }
}

function toBlobPart(bytes: Uint8Array): BlobPart {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.rel = "noopener"
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

type WritableFile = {
  write: (data: Uint8Array) => Promise<unknown>
  close: () => Promise<unknown>
  abort?: () => Promise<unknown>
}

export async function decryptAndSave(
  token: string,
  file: DownloadableFile,
  masterKey: Uint8Array
) {
  const mimeType = storageContentType(file.mimeType)
  const picker = (
    window as unknown as {
      showSaveFilePicker?: (options: {
        suggestedName: string
      }) => Promise<{ createWritable: () => Promise<WritableFile> }>
    }
  ).showSaveFilePicker

  if (picker) {
    let handle
    try {
      handle = await picker({ suggestedName: file.filename })
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return
      if (
        !(error instanceof DOMException) ||
        !["NotAllowedError", "SecurityError", "NotSupportedError"].includes(
          error.name
        )
      )
        throw error
    }
    if (handle) {
      const writable = await handle.createWritable()
      try {
        await decryptToWritable(file, masterKey, token, {
          write: async (data) => {
            await writable.write(data)
          },
        })
        await writable.close()
      } catch (error) {
        await writable.abort?.().catch(() => undefined)
        throw error
      }
      return
    }
  }

  const parts: BlobPart[] = []
  await decryptToWritable(file, masterKey, token, {
    write: async (data) => {
      parts.push(toBlobPart(data))
    },
  })
  downloadBlob(file.filename, new Blob(parts, { type: mimeType }))
}

export async function decryptAndSaveAll(
  token: string,
  files: DownloadableFile[],
  masterKey: Uint8Array
) {
  const directoryPicker = (
    window as unknown as {
      showDirectoryPicker?: () => Promise<{
        getFileHandle: (
          name: string,
          options: { create: boolean }
        ) => Promise<{ createWritable: () => Promise<WritableFile> }>
      }>
    }
  ).showDirectoryPicker

  if (directoryPicker) {
    let directory
    try {
      directory = await directoryPicker()
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return
      if (
        !(error instanceof DOMException) ||
        !["NotAllowedError", "SecurityError", "NotSupportedError"].includes(
          error.name
        )
      )
        throw error
    }
    if (directory) {
      for (const file of files) {
        const handle = await directory.getFileHandle(file.filename, {
          create: true,
        })
        const writable = await handle.createWritable()
        try {
          await decryptToWritable(file, masterKey, token, {
            write: async (data) => {
              await writable.write(data)
            },
          })
          await writable.close()
        } catch (error) {
          await writable.abort?.().catch(() => undefined)
          throw error
        }
      }
      return
    }
  }

  for (const file of files) {
    await decryptAndSave(token, file, masterKey)
  }
}
