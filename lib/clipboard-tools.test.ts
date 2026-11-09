import { describe, expect, it } from "vitest"
import { transformText, replaceLiteral } from "./clipboard-tools"
describe("clipboard tools", () => {
  it("roundtrips Unicode without data loss", () => {
    const value = "Hello 👋 नमस्ते 🌎"
    expect(
      transformText(transformText(value, "encode-base64"), "decode-base64")
    ).toBe(value)
    expect(
      transformText(transformText(value, "encode-url"), "decode-url")
    ).toBe(value)
  })
  it("formats and compacts valid JSON", () => {
    expect(transformText('{"x":1}', "json")).toBe('{\n  "x": 1\n}')
    expect(transformText('{ "x": 1 }', "compact-json")).toBe('{"x":1}')
  })
  it("rejects malformed encodings and JSON", () => {
    expect(() => transformText("%zz", "decode-url")).toThrow()
    expect(() => transformText("{bad}", "json")).toThrow()
    expect(() => transformText("!!!!", "decode-base64")).toThrow()
  })
  it("keeps replacements literal including dollar signs", () => {
    expect(replaceLiteral("a.b a.b", "a.b", "$&")).toBe("$& $&")
    expect(replaceLiteral("keep", "", "erase")).toBe("keep")
  })
  it("normalizes and deduplicates lines without executing input", () => {
    expect(transformText("a\nb\na", "deduplicate")).toBe("a\nb")
    expect(transformText(" b \n a ", "trim")).toBe("b\n a")
    expect(transformText("b\na", "sort")).toBe("a\nb")
  })
})
