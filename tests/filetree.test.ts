import { describe, it, expect } from "vitest";
import { FileTree, type DirEntry } from "../src/filetree";

const noop = () => {};

async function openTree(entries: DirEntry[]) {
  const el = document.createElement("aside");
  const tree = new FileTree(el, {
    readDir: async () => entries,
    onOpenFolder: noop,
    onOpenFile: noop,
    onNewFile: noop,
    onNewFolder: noop,
  });
  await tree.open("/root");
  return el;
}

describe("FileTree icons", () => {
  it("draws folder and file rows with stroke-only line icons, not emoji", async () => {
    const el = await openTree([
      { name: "docs", path: "/root/docs", is_dir: true },
      { name: "README.md", path: "/root/README.md", is_dir: false },
    ]);

    const icons = [...el.querySelectorAll(".ft-row .ft-icon")];
    expect(icons).toHaveLength(2);
    for (const icon of icons) {
      expect(icon.textContent).toBe("");
      const svg = icon.querySelector("svg");
      expect(svg?.getAttribute("fill")).toBe("none");
      expect(svg?.getAttribute("stroke")).toBe("currentColor");
    }
  });

  it("draws header actions as line icons and keeps their tooltips", async () => {
    const el = await openTree([]);

    const buttons = [...el.querySelectorAll<HTMLButtonElement>(".ft-actions button")];
    expect(buttons.map((b) => b.dataset.tip)).toEqual(["New file", "New folder", "Open folder…"]);
    for (const b of buttons) {
      expect(b.textContent).toBe("");
      expect(b.querySelector("svg")?.getAttribute("stroke")).toBe("currentColor");
    }
  });
});
