export const TEXT_MAX_LINES = 15_000
export const TEXT_MAX_BYTES = 1024 * 1024
export const WIDE_MAX_BYTES = 20 * 1024 ** 3
export const WIDE_CHUNK_BYTES = 12 * 1024
export const WIDE_MAX_FILES = 1000
export type WideFile = {
  name: string
  size: number
  modified: number
  fingerprint: string
}
export function lineCount(text: string) {
  return text ? text.split(/\r\n|\r|\n/).length : 0
}
export function validateText(content: unknown): asserts content is string {
  if (typeof content !== "string" || !content.trim())
    throw new Error("Enter some text before sharing.")
  if (lineCount(content) > TEXT_MAX_LINES)
    throw new Error(
      "Text Pad supports up to 15,000 lines. Split this text into smaller pads."
    )
  if (new TextEncoder().encode(content).length > TEXT_MAX_BYTES)
    throw new Error(
      "Text Pad supports up to 1 MiB of UTF-8 text. Shorten this pad before sharing."
    )
}
export function validateManifest(input: unknown): WideFile[] {
  if (!Array.isArray(input) || !input.length || input.length > WIDE_MAX_FILES)
    throw new Error("Choose between 1 and 1,000 files.")
  let total = 0
  const names = new Set<string>()
  const files = input.map((f: WideFile) => {
    if (
      !f ||
      typeof f.name !== "string" ||
      f.name.length > 500 ||
      !f.name ||
      /[\x00-\x1f]/.test(f.name) ||
      f.name.split(/[\\/]/).some((p) => !p || p === ".." || p === ".") ||
      names.has(f.name)
    )
      throw new Error("Use distinct, valid file or folder names.")
    if (
      !Number.isSafeInteger(f.size) ||
      f.size < 0 ||
      !Number.isSafeInteger(f.modified) ||
      f.modified < 0 ||
      !/^[a-f0-9]{64}$/.test(f.fingerprint)
    )
      throw new Error("File metadata is invalid. Select the files again.")
    names.add(f.name)
    total += f.size
    return {
      name: f.name,
      size: f.size,
      modified: f.modified,
      fingerprint: f.fingerprint,
    }
  })
  if (total > WIDE_MAX_BYTES)
    throw new Error(
      "Wide Connect supports up to 20 GB per session. Remove some files."
    )
  return files
}
export function validOffset(offset: unknown, size: number): offset is number {
  return (
    typeof offset === "number" &&
    Number.isSafeInteger(offset) &&
    offset >= 0 &&
    offset <= size &&
    (offset === size || offset % WIDE_CHUNK_BYTES === 0)
  )
}
