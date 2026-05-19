import MarkdownIt from "markdown-it";
import taskLists from "markdown-it-task-lists";
import hljs from "highlight.js";
import DOMPurify from "dompurify";
import darkHljs from "highlight.js/styles/github-dark.css?inline";
import lightHljs from "highlight.js/styles/github.css?inline";

export type Theme = "dark" | "light";

/** Swap the syntax-highlighting stylesheet for the active UI theme. */
export function setCodeTheme(theme: Theme): void {
  let style = document.getElementById("hljs-theme") as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = "hljs-theme";
    document.head.appendChild(style);
  }
  style.textContent = theme === "dark" ? darkHljs : lightHljs;
}

// GitHub-Flavored Markdown: tables, strikethrough and autolinks are built in;
// task lists are added via the plugin. Fenced code is syntax-highlighted.
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  highlight(code, lang): string {
    let inner: string;
    let cls = "hljs";
    if (lang && hljs.getLanguage(lang)) {
      try {
        inner = hljs.highlight(code, { language: lang }).value;
        cls += ` language-${lang}`;
      } catch {
        inner = md.utils.escapeHtml(code);
      }
    } else {
      // No fence language, or an unknown/misspelled one (e.g. ```pyhton):
      // fall back to highlight.js auto-detection so it still gets colored.
      try {
        const auto = hljs.highlightAuto(code);
        inner = auto.value;
        if (auto.language) cls += ` language-${auto.language}`;
      } catch {
        inner = md.utils.escapeHtml(code);
      }
    }
    // Returning a full <pre> makes markdown-it skip its own wrapper, so the
    // <code> carries the `hljs` class the theme stylesheet styles.
    return `<pre><code class="${cls}">${inner}</code></pre>`;
  },
}).use(taskLists, { enabled: true, label: true });

/** Render Markdown source to sanitized HTML safe to inject into the preview. */
export function renderMarkdown(source: string): string {
  const raw = md.render(source);
  return DOMPurify.sanitize(raw, {
    ADD_ATTR: ["target"],
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed"],
  });
}
