import { WIDE_CHUNK_BYTES, type WideFile } from "@/lib/mode-limits"
export const EMPTY_CHAIN = "0".repeat(64)
export async function sha256(data: BufferSource) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", data)),
    (b) => b.toString(16).padStart(2, "0")
  ).join("")
}
export async function nextChain(previous: string, chunkHash: string) {
  return sha256(new TextEncoder().encode(`${previous}:${chunkHash}`))
}
export async function fileMetadata(file: File): Promise<WideFile> {
  const first = await file.slice(0, WIDE_CHUNK_BYTES).arrayBuffer(),
    last = await file
      .slice(Math.max(0, file.size - WIDE_CHUNK_BYTES))
      .arrayBuffer()
  return {
    name: file.webkitRelativePath || file.name,
    size: file.size,
    modified: file.lastModified,
    fingerprint: await sha256(
      new TextEncoder().encode(
        `${file.size}:${file.lastModified}:${await sha256(first)}:${await sha256(last)}`
      )
    ),
  }
}
export async function chainPrefix(
  file: File,
  offset: number,
  cancelled = () => false
) {
  let chain = EMPTY_CHAIN
  for (let i = 0; i < offset; i += WIDE_CHUNK_BYTES) {
    if (cancelled())
      throw new Error(
        "Source verification stopped. Retry when both devices are ready."
      )
    chain = await nextChain(
      chain,
      await sha256(
        await file
          .slice(i, Math.min(i + WIDE_CHUNK_BYTES, offset))
          .arrayBuffer()
      )
    )
  }
  return chain
}
