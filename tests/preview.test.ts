import { describe, it, expect } from "vitest";
import { renderMarkdown } from "../src/preview";

describe("renderMarkdown (GFM)", () => {
  it("renders headings and emphasis", () => {
    const html = renderMarkdown("# Title\n\n**bold** and *italic*");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
  });

  it("renders tables", () => {
    const html = renderMarkdown("| A | B |\n| - | - |\n| 1 | 2 |");
    expect(html).toContain("<table>");
    expect(html).toContain("<td>1</td>");
  });

  it("renders task lists with checkboxes", () => {
    const html = renderMarkdown("- [x] done\n- [ ] todo");
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("checked");
  });

  it("renders strikethrough and fenced code", () => {
    const html = renderMarkdown("~~gone~~\n\n```js\nconst x = 1;\n```");
    expect(html).toContain("<s>gone</s>");
    expect(html).toContain("<pre><code");
  });

  it("strips dangerous markup", () => {
    const html = renderMarkdown('<script>alert(1)</script>\n\n[x](javascript:alert(1))');
    // No executable script survives sanitization.
    expect(html).not.toContain("<script>");
    // The javascript: URL is never emitted as a clickable href.
    expect(html.toLowerCase()).not.toContain('href="javascript:');
  });
});
