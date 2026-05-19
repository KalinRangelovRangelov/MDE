# Reload File Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Reload action (toolbar button + Cmd/Ctrl+R) that re-reads the active tab's file from disk, discarding unsaved changes after confirmation.

**Architecture:** A new `TabManager.markReloaded(content)` method encapsulates resetting the active tab to on-disk content. `main.ts` gains a `reloadFile()` function wired to a toolbar button and the existing keydown handler. Reuses the existing `read_file` Tauri command — no Rust changes.

**Tech Stack:** TypeScript, Vite, Vitest, Tauri 2.

---

### Task 1: `TabManager.markReloaded`

**Files:**
- Modify: `src/tabs.ts` (add method after `markSaved`, ~line 92)
- Test: `tests/tabs.test.ts`

- [ ] **Step 1: Write the failing test**

Add inside the `describe("TabManager", ...)` block in `tests/tabs.test.ts`:

```ts
it("markReloaded replaces doc + savedDoc, clears dirty, and notifies", () => {
  let notified = 0;
  const tm = new TabManager(() => { notified++; });
  tm.markSaved("/tmp/note.md");
  tm.setDoc("local edits");
  expect(isDirty(tm.active)).toBe(true);
  const before = notified;
  tm.markReloaded("fresh from disk");
  expect(tm.active.doc).toBe("fresh from disk");
  expect(isDirty(tm.active)).toBe(false);
  expect(notified).toBe(before + 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tabs`
Expected: FAIL — `tm.markReloaded is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `src/tabs.ts`, add this method immediately after the `markSaved` method (it ends at the line with `this.onChange();\n  }` around line 92):

```ts
  /** Replace the active tab's content with freshly-read on-disk content. */
  markReloaded(content: string): void {
    const t = this.active;
    t.doc = content;
    t.savedDoc = content;
    this.onChange();
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tabs`
Expected: PASS (all tests in the file green).

- [ ] **Step 5: Commit**

```bash
git add src/tabs.ts tests/tabs.test.ts
git commit -m "Add TabManager.markReloaded

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `reloadFile()` + toolbar button + shortcut

**Files:**
- Modify: `src/main.ts` (add `reloadFile` after `openPath`, ~line 261; add toolbar button at line 153; add key case at line 305)

No unit test: `reloadFile` is glue over Tauri dialog/FS APIs and DOM, consistent with the untested `openFile`/`saveFile` in the same file. Verified by the manual smoke test in Task 3.

- [ ] **Step 1: Add `reloadFile()`**

In `src/main.ts`, insert after the `openPath` function (which ends at line 261 with its closing `}`), before the `// Wire up OS "Open with"` comment:

```ts
async function reloadFile() {
  const tab = tabs.active;
  if (!tab.path) {
    toast("Nothing to reload — file isn't saved yet", "error");
    return;
  }
  if (isDirty(tab) &&
      !confirm(`Reload from disk? Unsaved changes to “${tab.name}” will be lost.`)) {
    return;
  }
  try {
    const content = await readFile(tab.path);
    tabs.markReloaded(content);
    editor.setDoc(content);
    updatePreview();
    editor.focus();
    toast(`Reloaded ${tab.name}`, "ok");
  } catch (e) {
    toast(String(e), "error");
  }
}
```

- [ ] **Step 2: Import `isDirty`**

`reloadFile` uses `isDirty`. Update the existing tabs import at the top of `src/main.ts` (line 4):

```ts
import { TabManager, isDirty, dirname } from "./tabs";
```

(If `isDirty` is already in that import, leave it unchanged.)

- [ ] **Step 3: Add the toolbar button**

In `buildToolbar()` at `src/main.ts:153`, change:

```ts
  toolbarEl.append(sep(), iconBtn("📂 Open", openFile), iconBtn("💾 Save", () => saveFile(false)),
    iconBtn("Save As", () => saveFile(true)));
```

to:

```ts
  toolbarEl.append(sep(), iconBtn("📂 Open", openFile),
    iconBtn("⟳ Reload", reloadFile),
    iconBtn("💾 Save", () => saveFile(false)),
    iconBtn("Save As", () => saveFile(true)));
```

- [ ] **Step 4: Add the keyboard shortcut**

In the keydown handler in `src/main.ts` (the `else if` chain starting line 304), add an `r` case after the `o` case:

```ts
  else if (k === "o") { e.preventDefault(); openFile(); }
  else if (k === "r") { e.preventDefault(); reloadFile(); }
```

- [ ] **Step 5: Verify it builds**

Run: `npm run build`
Expected: PASS — `tsc --noEmit` reports no errors and Vite build completes.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts
git commit -m "Add Reload file action (button + Cmd/Ctrl+R)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Manual smoke test

**Files:** none (verification only).

- [ ] **Step 1: Launch the app**

Run: `npm run tauri dev`
Expected: app window opens.

- [ ] **Step 2: Verify reload of an externally-changed file**

1. Open a saved `.md` file via 📂 Open.
2. In a terminal, append a line to that file with an external tool (e.g. `echo "external line" >> /path/to/file.md`).
3. Press **Cmd+R** (macOS) / **Ctrl+R** (Win/Linux).
4. Expected: editor and preview show the external line; a "Reloaded <name>" toast appears; the tab's dirty dot is absent.

- [ ] **Step 3: Verify the dirty-confirm path**

1. Type some edits into the open file (dirty dot appears).
2. Click ⟳ Reload.
3. Expected: a confirm dialog appears. Cancel → edits remain. Reload again, accept → editor reverts to disk content, dirty dot clears.

- [ ] **Step 4: Verify the untitled guard**

1. Open a new tab (Cmd+N) — it's "Untitled".
2. Press Cmd+R.
3. Expected: toast "Nothing to reload — file isn't saved yet"; no crash; webview does NOT reload.

- [ ] **Step 5: Update progress.html**

Per project convention, reflect the new Reload feature in `progress.html`, then commit:

```bash
git add progress.html
git commit -m "Update progress: reload file feature

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```
