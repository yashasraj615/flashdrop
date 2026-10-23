import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { Markdown } from "../components/text-pad"
describe("shared Markdown rendering", () => {
  it("does not execute HTML, script URLs or load remote tracking images", () => {
    const html = renderToStaticMarkup(
      createElement(Markdown, {
        text: "<script>alert(1)</script>\n\n<img src=x onerror=alert(2)>\n\n[bad](javascript:alert%281%29)\n\n![tracking](https://tracker.example/pixel)",
      })
    )
    expect(html).not.toContain("<script")
    expect(html).not.toContain("onerror=")
    expect(html).not.toContain("javascript:")
    expect(html).not.toContain("<img")
    expect(html).not.toContain('src="https://tracker')
  })
  it("formats common Markdown while escaping code", () => {
    const html = renderToStaticMarkup(
      createElement(Markdown, {
        text: "# Notes\n\n- **Original quality**\n\n```html\n<img onerror=alert(1)>\n```",
      })
    )
    expect(html).toContain("<h1>Notes</h1>")
    expect(html).toContain("<strong>Original quality</strong>")
    expect(html).toContain("&lt;img")
  })
})
