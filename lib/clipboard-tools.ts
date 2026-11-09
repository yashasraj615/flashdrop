export type TextTool =
  | "upper"
  | "lower"
  | "trim"
  | "deduplicate"
  | "sort"
  | "json"
  | "compact-json"
  | "encode-url"
  | "decode-url"
  | "encode-base64"
  | "decode-base64"
export function transformText(text: string, tool: TextTool): string {
  switch (tool) {
    case "upper":
      return text.toLocaleUpperCase()
    case "lower":
      return text.toLocaleLowerCase()
    case "trim":
      return text
        .split(/\r?\n/)
        .map((l) => l.trimEnd())
        .join("\n")
        .trim()
    case "deduplicate":
      return [...new Set(text.split(/\r?\n/))].join("\n")
    case "sort":
      return text
        .split(/\r?\n/)
        .sort((a, b) => a.localeCompare(b))
        .join("\n")
    case "json":
      return JSON.stringify(JSON.parse(text), null, 2)
    case "compact-json":
      return JSON.stringify(JSON.parse(text))
    case "encode-url":
      return encodeURIComponent(text)
    case "decode-url":
      return decodeURIComponent(text)
    case "encode-base64": {
      const bytes = new TextEncoder().encode(text)
      let binary = ""
      for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
      return btoa(binary)
    }
    case "decode-base64":
      return new TextDecoder("utf-8", { fatal: true }).decode(
        Uint8Array.from(atob(text), (c) => c.charCodeAt(0))
      )
  }
}
export function replaceLiteral(
  text: string,
  find: string,
  replacement: string
) {
  return find ? text.split(find).join(replacement) : text
}
