import {
  DecorationSet,
  Decoration,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
  keymap,
} from "@codemirror/view";
import { Prec, StateEffect, StateField } from "@codemirror/state";

import { fetcher } from "./fetcher";

/**
 * ==========================================
 * SUGGESTION EXTENSION FOR CODEMIRROR
 * ==========================================
 *
 * This extension provides AI-powered code completion as you type.
 * It works like watching gears in a clock:
 *
 * 1. User types → 2. Debounce waits 300ms → 3. Fetch suggestion from API
 * 4. Render as ghost text → 5. User presses Tab to accept
 */

/**
 * STATE MANAGEMENT
 * ================
 */

// StateEffect: A message type that says "set the suggestion to this value"
const setSuggestionEffect = StateEffect.define<string | null>();

// StateField: Stores the current suggestion in editor state
// - create(): Initial state is null (no suggestion)
// - update(): When setSuggestionEffect is dispatched, update the value
const suggestionState = StateField.define<string | null>({
  create() {
    return null;
  },
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setSuggestionEffect)) {
        return effect.value;
      }
    }
    return value;
  },
});

/**
 * UI - SUGGESTION WIDGET
 * ======================
 */

// WidgetType: Creates the actual visual element (DOM node) for the suggestion
class SuggestionWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }

  toDOM() {
    const span = document.createElement("span");
    span.textContent = this.text;
    span.style.opacity = "0.4"; // Ghost text - semi-transparent
    span.style.color = "rgba(128, 128, 128, 0.5)"; // Grayish
    span.style.pointerEvents = "none"; // Don't interfere with editor interactions
    return span;
  }
}

/**
 * PLUGIN STATE
 * ============
 */

const DEBOUNCE_DELAY = 300; // milliseconds

const JSX_CONDITION_HINT = /\{\s*[A-Za-z_$][A-Za-z0-9_$]*\s+$/;
const ASSIGNMENT_HINT =
  /\b(?:const|let|var)\s+[A-Za-z_$][A-Za-z0-9_$]*\s*=\s*$/;

const getAssignmentSuggestion = (line: string) => {
  const match = line.match(
    /\b(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*$/,
  );

  if (!match) {
    return null;
  }

  const variableName = match[1].toLowerCase();

  if (
    variableName.startsWith("is") ||
    variableName.startsWith("has") ||
    variableName.startsWith("can") ||
    variableName.startsWith("should")
  ) {
    return "false";
  }

  if (
    variableName.includes("count") ||
    variableName.includes("length") ||
    variableName.includes("size") ||
    variableName.includes("index") ||
    variableName.includes("total")
  ) {
    return "0";
  }

  if (
    variableName.includes("list") ||
    variableName.includes("items") ||
    variableName.includes("array") ||
    variableName.endsWith("s")
  ) {
    return "[]";
  }

  if (
    variableName.includes("config") ||
    variableName.includes("options") ||
    variableName.includes("params") ||
    variableName.includes("data")
  ) {
    return "{}";
  }

  if (
    variableName.includes("name") ||
    variableName.includes("title") ||
    variableName.includes("label") ||
    variableName.includes("message") ||
    variableName.includes("text") ||
    variableName.includes("user")
  ) {
    return '"John"';
  }

  return '"John"';
};

const getLocalSuggestion = (
  view: EditorView,
  fileName: string,
): string | null => {
  const selection = view.state.selection.main;
  if (!selection.empty) return null;

  const lowerFileName = fileName.toLowerCase();
  const isJsxLikeFile =
    lowerFileName.endsWith(".tsx") ||
    lowerFileName.endsWith(".jsx") ||
    lowerFileName.endsWith(".mdx");

  if (!isJsxLikeFile) return null;

  const cursorPosition = selection.head;
  const currentLine = view.state.doc.lineAt(cursorPosition);
  const cursorInLine = cursorPosition - currentLine.from;
  const textBeforeCursor = currentLine.text.slice(0, cursorInLine);
  const textAfterCursor = currentLine.text.slice(cursorInLine);

  if (
    JSX_CONDITION_HINT.test(textBeforeCursor) &&
    !textAfterCursor.trimStart().startsWith("&&")
  ) {
    return "&& (";
  }

  const isJsLikeFile =
    lowerFileName.endsWith(".ts") ||
    lowerFileName.endsWith(".tsx") ||
    lowerFileName.endsWith(".js") ||
    lowerFileName.endsWith(".jsx") ||
    lowerFileName.endsWith(".mdx");

  if (isJsLikeFile && ASSIGNMENT_HINT.test(textBeforeCursor)) {
    return getAssignmentSuggestion(textBeforeCursor);
  }

  return null;
};

/**
 * CONTEXT EXTRACTION
 * ==================
 * Extract relevant code context from the editor to send to API
 */

const generatePayload = (view: EditorView, fileName: string) => {
  const selection = view.state.selection.main;
  if (!selection.empty) return null;

  const code = view.state.doc.toString();
  if (!code || code.trim().length === 0) return null;

  const cursorPosition = view.state.selection.main.head;
  const currentLine = view.state.doc.lineAt(cursorPosition);
  const cursorInLine = cursorPosition - currentLine.from;

  // Get up to 5 previous lines for context
  const previousLines: string[] = [];
  const previousLinesToFetch = Math.min(5, currentLine.number - 1);
  for (let i = previousLinesToFetch; i >= 1; i--) {
    previousLines.push(view.state.doc.line(currentLine.number - i).text);
  }

  // Get up to 5 next lines for context
  const nextLines: string[] = [];
  const totalLines = view.state.doc.lines;
  const linesToFetch = Math.min(5, totalLines - currentLine.number);
  for (let i = 1; i <= linesToFetch; i++) {
    nextLines.push(view.state.doc.line(currentLine.number + i).text);
  }

  return {
    fileName,
    code,
    currentLine: currentLine.text,
    previousLines: previousLines.join("\n"),
    textBeforeCursor: currentLine.text.slice(0, cursorInLine),
    textAfterCursor: currentLine.text.slice(cursorInLine),
    nextLines: nextLines.join("\n"),
    lineNumber: currentLine.number,
  };
};

/**
 * DEBOUNCE PLUGIN
 * ===============
 * Waits 300ms after user stops typing before fetching suggestion.
 * This prevents hammering the API on every keystroke.
 */

const createDebouncePlugin = (fileName: string) => {
  return ViewPlugin.fromClass(
    class {
      private debounceTimer: number | null = null;
      private currentAbortController: AbortController | null = null;
      private isWaitingForSuggestion = false;
      private isDestroyed = false;

      constructor(view: EditorView) {
        this.triggerSuggestion(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.selectionSet) {
          const selection = update.view.state.selection.main;
          if (!selection.empty) {
            if (this.debounceTimer !== null) {
              clearTimeout(this.debounceTimer);
              this.debounceTimer = null;
            }
            if (this.currentAbortController !== null) {
              this.currentAbortController.abort();
              this.currentAbortController = null;
            }
            this.isWaitingForSuggestion = false;
            return;
          }
          this.triggerSuggestion(update.view);
        }
      }

      triggerSuggestion(view: EditorView) {
        // Clear previous timer
        if (this.debounceTimer !== null) {
          clearTimeout(this.debounceTimer);
        }

        // Cancel any in-flight request
        if (this.currentAbortController !== null) {
          this.currentAbortController.abort();
        }

        this.isWaitingForSuggestion = true;

        // Wait 300ms, then fetch
        this.debounceTimer = window.setTimeout(async () => {
          if (this.isDestroyed) return;

          const localSuggestion = getLocalSuggestion(view, fileName);
          if (localSuggestion) {
            this.isWaitingForSuggestion = false;
            view.dispatch({
              effects: setSuggestionEffect.of(localSuggestion),
            });
            return;
          }

          const payload = generatePayload(view, fileName);
          if (!payload) {
            this.isWaitingForSuggestion = false;
            view.dispatch({ effects: setSuggestionEffect.of(null) });
            return;
          }

          this.currentAbortController = new AbortController();
          const suggestion = await fetcher(
            payload,
            this.currentAbortController.signal,
          );

          if (this.isDestroyed) return;

          this.isWaitingForSuggestion = false;
          view.dispatch({
            effects: setSuggestionEffect.of(suggestion),
          });
        }, DEBOUNCE_DELAY);
      }

      destroy() {
        this.isDestroyed = true;

        if (this.debounceTimer !== null) {
          clearTimeout(this.debounceTimer);
        }
        if (this.currentAbortController !== null) {
          this.currentAbortController.abort();
        }
        this.isWaitingForSuggestion = false;
      }
    },
  );
};

/**
 * RENDER PLUGIN
 * =============
 * Displays the suggestion as decorations (visual overlays) in the editor.
 * Watches the suggestion state and updates decorations when it changes.
 */

const renderPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      // Initial decorations (usually empty since no suggestion yet)
      this.decorations = this.build(view);
    }

    // Create decorations from current editor state
    build(view: EditorView): DecorationSet {
      const selection = view.state.selection.main;
      if (!selection.empty) {
        return Decoration.none;
      }

      // Get the suggestion text from state
      const suggestion = view.state.field(suggestionState);
      if (!suggestion) {
        return Decoration.none; // No suggestion = no decorations
      }

      // Get cursor position
      const cursor = view.state.selection.main.head;

      // Create a widget decoration at cursor
      const decoration = Decoration.widget({
        widget: new SuggestionWidget(suggestion),
        side: 1, // Render after cursor
      });

      // Return decoration set containing this one decoration
      return Decoration.set([decoration.range(cursor)]);
    }

    // Called when editor state changes
    update(update: ViewUpdate) {
      // Check if suggestion changed
      const suggestionChanged = update.transactions.some((transaction) => {
        return transaction.effects.some((effect) => {
          return effect.is(setSuggestionEffect);
        });
      });

      // Check if we need to rebuild decorations
      const shouldRebuild =
        update.docChanged || update.selectionSet || suggestionChanged;

      if (shouldRebuild) {
        this.decorations = this.build(update.view);
      }
    }
  },
  {
    // Tell CodeMirror which field contains our decorations
    decorations: (plugin) => plugin.decorations,
  },
);

/**
 * KEYBOARD SHORTCUTS
 * ==================
 * Tab: Accept the suggestion
 * Escape: Dismiss the suggestion
 */

const acceptSuggestionKeymap = keymap.of([
  {
    key: "Tab",
    run: (view) => {
      const selection = view.state.selection.main;
      if (!selection.empty) {
        return false;
      }

      const suggestion = view.state.field(suggestionState);
      if (!suggestion) {
        return false; // No suggestion? Let Tab do its normal thing (indent)
      }

      const cursor = view.state.selection.main.head;
      view.dispatch({
        changes: { from: cursor, insert: suggestion }, // Insert the suggestion text
        selection: { anchor: cursor + suggestion.length }, // Move cursor to end
        effects: setSuggestionEffect.of(null), // Clear the suggestion
      });
      return true; // We handled Tab, don't indent
    },
  },
]);

export const suggestion = (fileName: string) => [
  suggestionState,
  createDebouncePlugin(fileName),
  renderPlugin,
  Prec.highest(acceptSuggestionKeymap),
];
