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

  it("syntax-highlights a fenced block with a language", () => {
    const html = renderMarkdown("```python\ndef f(x):\n    return x + 1\n```");
    expect(html).toContain('class="hljs language-python"');
    expect(html).toContain('class="hljs-keyword"'); // `def`/`return` tokens
  });

  it("highlights C blocks too", () => {
    const html = renderMarkdown("```c\nint main(void){ return 0; }\n```");
    expect(html).toContain('class="hljs language-c"');
    expect(html).toContain("hljs-");
  });

  it("auto-highlights when the language is missing or misspelled", () => {
    const typo = renderMarkdown("```pyhton\ndef f():\n    return 1\n```");
    const none = renderMarkdown("```\nSELECT * FROM users WHERE id = 1;\n```");
    // Still produces an hljs code block (not plain escaped text).
    expect(typo).toContain('<code class="hljs');
    expect(typo).toContain("hljs-");
    expect(none).toContain('<code class="hljs');
  });

  it("strips dangerous markup", () => {
    const html = renderMarkdown('<script>alert(1)</script>\n\n[x](javascript:alert(1))');
    // No executable script survives sanitization.
    expect(html).not.toContain("<script>");
    // The javascript: URL is never emitted as a clickable href.
    expect(html.toLowerCase()).not.toContain('href="javascript:');
  });
});
