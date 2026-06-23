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

// ---- Local image resolution ----------------------------------------------
// Markdown files reference images with paths relative to the file's own
// directory, but the preview lives at the webview origin. We resolve such
// paths to an absolute path and stash it in `data-rel-src`; the Tauri layer
// (main.ts) converts that to an asset URL after sanitization. Keeping it a
// data-* attribute means DOMPurify preserves it and we never touch its
// URL-scheme allowlist. This file stays Tauri-agnostic for unit tests.

/** True when a link/image target has a URL scheme (http:, mailto:, …) or is
 *  protocol-relative (`//host`) — i.e. points outside the local document. */
export function isExternal(src: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith("//");
}
function isAbsolute(src: string): boolean {
  return src.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(src);
}
function resolvePath(baseDir: string, rel: string): string {
  const combined = isAbsolute(rel) ? rel : `${baseDir}/${rel}`;
  const lead = combined.startsWith("/") ? "/" : ""; // preserve POSIX root
  const out: string[] = [];
  for (const p of combined.split(/[\\/]+/)) {
    if (p === "" || p === ".") continue;
    if (p === "..") out.pop();
    else out.push(p);
  }
  return lead + out.join("/");
}

const defaultImage = md.renderer.rules.image!;
md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const src = token.attrGet("src");
  if (src && !isExternal(src) && !src.startsWith("data:")) {
    if (env?.baseUrl) {
      // Web-sourced doc: resolve against the source URL to an absolute https
      // URL the webview can load directly (CSP already allows https: images).
      try {
        token.attrSet("src", new URL(src, env.baseUrl).href);
      } catch {
        /* malformed base — leave src untouched */
      }
    } else if (env?.baseDir) {
      // Local file: stash an absolute path for the Tauri asset-protocol rewrite.
      token.attrSet("data-rel-src", resolvePath(env.baseDir, src));
    }
  }
  return defaultImage(tokens, idx, options, env, self);
};

// ---- BBCode-style quote tags ----------------------------------------------
// Expand `[quote] … [/quote]` blocks into Markdown blockquotes before parsing,
// so their contents get full Markdown rendering and nest naturally. Markers on
// their own line open/close a block; a `[quote]text[/quote]` on one line is a
// single quoted line. Markers inside fenced code blocks are left untouched.
export function expandQuoteTags(source: string): string {
  const out: string[] = [];
  let depth = 0;
  let fence: string | null = null;
  const emit = (line: string) => out.push(depth > 0 ? "> ".repeat(depth) + line : line);

  for (const line of source.split("\n")) {
    const trimmed = line.trim();
    if (fence !== null) {
      emit(line);
      if (trimmed.startsWith(fence)) fence = null;
      continue;
    }
    const open = trimmed.match(/^(`{3,}|~{3,})/);
    if (open) {
      emit(line);
      fence = open[1];
      continue;
    }
    if (/^\[quote\]$/i.test(trimmed)) { depth++; continue; }
    if (/^\[\/quote\]$/i.test(trimmed)) { if (depth > 0) depth--; continue; }
    const wrap = trimmed.match(/^\[quote\]([\s\S]*?)\[\/quote\]$/i);
    if (wrap) { out.push("> ".repeat(depth + 1) + wrap[1].trim()); continue; }
    emit(line);
  }
  return out.join("\n");
}

/**
 * Render Markdown source to sanitized HTML safe to inject into the preview.
 * `baseDir` (the open file's directory) enables local-image resolution;
 * `baseUrl` (a web doc's source URL) resolves relative images to absolute URLs.
 */
export function renderMarkdown(source: string, baseDir?: string, baseUrl?: string): string {
  const raw = md.render(expandQuoteTags(source), { baseDir, baseUrl });
  return DOMPurify.sanitize(raw, {
    ADD_ATTR: ["target"],
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed"],
  });
}
