// Reuse the encrypted part across retries; S3 replaces the same numbered part.
export async function putEncryptedPart(
  url: string,
  body: Uint8Array | Blob,
  contentType: string | undefined,
  onProgress: (loaded: number) => void,
  signal: AbortSignal
): Promise<string | null> {
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted()
    try {
      return await new Promise<string | null>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        const abort = () => xhr.abort()
        const cleanup = () => signal.removeEventListener("abort", abort)
        xhr.open("PUT", url)
        xhr.timeout = 120000
        if (contentType) xhr.setRequestHeader("Content-Type", contentType)
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) onProgress(e.loaded)
        }
        xhr.onload = () => {
          cleanup()
          if (xhr.status >= 200 && xhr.status < 300)
            resolve(xhr.getResponseHeader("ETag"))
          else
            reject(new Error("Upload failed. Check your connection and retry."))
        }
        xhr.onerror = xhr.ontimeout = () => {
          cleanup()
          reject(new Error("Upload connection timed out or failed."))
        }
        xhr.onabort = () => {
          cleanup()
          reject(new DOMException("Aborted", "AbortError"))
        }
        signal.addEventListener("abort", abort, { once: true })
        if (signal.aborted) {
          cleanup()
          reject(signal.reason || new DOMException("Aborted", "AbortError"))
          return
        }
        xhr.send(
          body instanceof Uint8Array ? new Blob([new Uint8Array(body)]) : body
        )
      })
    } catch (error) {
      if (signal.aborted || attempt >= 2) throw error
      await new Promise<void>((resolve, reject) => {
        const abort = () => {
          clearTimeout(timer)
          reject(signal.reason || new DOMException("Aborted", "AbortError"))
        }
        const timer = setTimeout(
          () => {
            signal.removeEventListener("abort", abort)
            resolve()
          },
          250 * 2 ** attempt
        )
        signal.addEventListener("abort", abort, { once: true })
        if (signal.aborted) abort()
      })
    }
  }
}
