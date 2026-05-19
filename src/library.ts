import type { SnippetSpec } from "./editor";

export interface LibraryItem {
  label: string;
  hint?: string;
  spec: SnippetSpec;
}

/** Compact toolbar: the most frequently used inline/block formatting. */
export const toolbar: LibraryItem[] = [
  { label: "B", hint: "Bold", spec: { insert: "**$**", wrap: { prefix: "**", suffix: "**" } } },
  { label: "i", hint: "Italic", spec: { insert: "*$*", wrap: { prefix: "*", suffix: "*" } } },
  { label: "S̶", hint: "Strikethrough", spec: { insert: "~~$~~", wrap: { prefix: "~~", suffix: "~~" } } },
  { label: "</>", hint: "Inline code", spec: { insert: "`$`", wrap: { prefix: "`", suffix: "`" } } },
  { label: "H1", hint: "Heading 1", spec: { insert: "# $", block: true } },
  { label: "H2", hint: "Heading 2", spec: { insert: "## $", block: true } },
  { label: "H3", hint: "Heading 3", spec: { insert: "### $", block: true } },
  { label: "“ ”", hint: "Quote", spec: { insert: "> $", block: true } },
  { label: "• List", hint: "Bullet list", spec: { insert: "- $", block: true } },
  { label: "1. List", hint: "Numbered list", spec: { insert: "1. $", block: true } },
  { label: "✓ Task", hint: "Task item", spec: { insert: "- [ ] $", block: true } },
  { label: "Link", hint: "Link", spec: { insert: "[$](url)", wrap: { prefix: "[", suffix: "](url)" } } },
];

/** Full browsable palette covering the GFM construct set. */
export const palette: { category: string; items: LibraryItem[] }[] = [
  {
    category: "Headings",
    items: [
      { label: "Heading 1", spec: { insert: "# $", block: true } },
      { label: "Heading 2", spec: { insert: "## $", block: true } },
      { label: "Heading 3", spec: { insert: "### $", block: true } },
      { label: "Heading 4", spec: { insert: "#### $", block: true } },
      { label: "Heading 5", spec: { insert: "##### $", block: true } },
      { label: "Heading 6", spec: { insert: "###### $", block: true } },
    ],
  },
  {
    category: "Inline",
    items: [
      { label: "Bold", spec: { insert: "**$**", wrap: { prefix: "**", suffix: "**" } } },
      { label: "Italic", spec: { insert: "*$*", wrap: { prefix: "*", suffix: "*" } } },
      { label: "Bold + Italic", spec: { insert: "***$***", wrap: { prefix: "***", suffix: "***" } } },
      { label: "Strikethrough", spec: { insert: "~~$~~", wrap: { prefix: "~~", suffix: "~~" } } },
      { label: "Inline code", spec: { insert: "`$`", wrap: { prefix: "`", suffix: "`" } } },
    ],
  },
  {
    category: "Lists",
    items: [
      { label: "Bullet list", hint: "- item", spec: { insert: "- $", block: true } },
      { label: "Numbered list", hint: "1. item", spec: { insert: "1. $", block: true } },
      { label: "Task list", hint: "- [ ] todo", spec: { insert: "- [ ] $", block: true } },
      { label: "Nested item", hint: "  - sub", spec: { insert: "  - $", block: true } },
    ],
  },
  {
    category: "Blocks",
    items: [
      { label: "Blockquote", spec: { insert: "> $", block: true } },
      { label: "Code block", spec: { insert: "```language\n$\n```", block: true } },
      { label: "Horizontal rule", spec: { insert: "---", block: true } },
      {
        label: "Table",
        spec: {
          insert:
            "| Column A | Column B |\n| --- | --- |\n| $ | cell |\n| cell | cell |",
          block: true,
        },
      },
    ],
  },
  {
    category: "Links & Media",
    items: [
      { label: "Link", hint: "[text](url)", spec: { insert: "[$](https://)", wrap: { prefix: "[", suffix: "](https://)" } } },
      { label: "Image", hint: "![alt](src)", spec: { insert: "![$](https://)" } },
      { label: "Autolink", hint: "<url>", spec: { insert: "<https://$>" } },
      { label: "Reference link", spec: { insert: "[$][ref]\n\n[ref]: https://", block: true } },
      { label: "Footnote", spec: { insert: "Text[^1]\n\n[^1]: $", block: true } },
    ],
  },
];
