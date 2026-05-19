import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { oneDark } from "@codemirror/theme-one-dark";
import { basicSetup } from "codemirror";

export interface SnippetSpec {
  /** Text inserted when there is no selection. `$` marks the final cursor. */
  insert: string;
  /** When text is selected, wrap it: prefix + selection + suffix. */
  wrap?: { prefix: string; suffix: string };
  /** Force the snippet onto its own line(s) (block constructs). */
  block?: boolean;
}

/** Thin wrapper around a CodeMirror 6 view with Markdown-aware editing. */
export class Editor {
  readonly view: EditorView;

  constructor(parent: HTMLElement, doc: string, onChange: (doc: string) => void) {
    this.view = new EditorView({
      parent,
      state: EditorState.create({
        doc,
        extensions: [
          basicSetup,
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          markdown({ codeLanguages: languages }),
          oneDark,
          EditorView.lineWrapping,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChange(u.state.doc.toString());
          }),
        ],
      }),
    });
  }

  getDoc(): string {
    return this.view.state.doc.toString();
  }

  /** Replace the whole document (used when switching tabs). */
  setDoc(doc: string): void {
    this.view.dispatch({
      changes: { from: 0, to: this.view.state.doc.length, insert: doc },
      selection: { anchor: 0 },
    });
  }

  focus(): void {
    this.view.focus();
  }

  /** Insert or wrap text from a tag-library snippet at the current selection. */
  applySnippet(spec: SnippetSpec): void {
    const { state } = this.view;
    const range = state.selection.main;
    const selected = state.sliceDoc(range.from, range.to);

    let from = range.from;
    let to = range.to;
    let insert: string;
    let cursor: number;

    if (selected && spec.wrap) {
      insert = spec.wrap.prefix + selected + spec.wrap.suffix;
      cursor = from + insert.length;
    } else {
      let text = spec.insert;
      // Place the caret at `$` if present, otherwise at the end.
      const marker = text.indexOf("$");
      const clean = text.replace("$", "");
      if (spec.block) {
        const line = state.doc.lineAt(from);
        const atLineStart = from === line.from;
        const prefix = atLineStart ? "" : "\n";
        const needsTrailing = to === state.doc.length ? "" : "\n";
        insert = prefix + clean + needsTrailing;
        cursor = from + (prefix.length) + (marker < 0 ? clean.length : marker);
      } else {
        insert = clean;
        cursor = from + (marker < 0 ? clean.length : marker);
      }
    }

    this.view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: cursor },
    });
    this.view.focus();
  }
}
