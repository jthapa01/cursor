import { Tooltip, showTooltip, keymap, EditorView } from "@codemirror/view";
import { StateField, EditorState, StateEffect } from "@codemirror/state";
import { fetchEditedCode } from "./fetcher";
import { toast } from "sonner";

/**
 * ==========================================
 * QUICK EDIT EXTENSION FOR CODEMIRROR
 * ==========================================
 *
 * This extension provides an AI-powered code editing form.
 * When user selects code and presses ⌘K, a form appears where they can
 * type instructions like "make this async" or "add error handling".
 * The AI then transforms the selected code according to the instruction.
 *
 * FLOW:
 * 1. User selects code
 * 2. User clicks "Quick Edit" button OR presses ⌘K
 * 3. Form tooltip appears below selection
 * 4. User types instruction
 * 5. User clicks Submit
 * 6. API call to /api/quick-edit (fetches edited code)
 * 7. Selected code replaced with edited version
 * 8. Form closes
 */

/**
 * STATE MANAGEMENT
 * ================
 */

// StateEffect: A message type that says "toggle quick edit form on/off"
export const showQuickEditEffect = StateEffect.define<boolean>();

let editorView: EditorView | null = null;
let currentAbortController: AbortController | null = null;
let quickEditRange: { from: number; to: number } | null = null;

// StateField: Tracks whether the quick-edit form is currently visible
// - create(): Initially false (form hidden)
// - update(): Responds to showQuickEditEffect OR clears when selection becomes empty
export const quickEditState = StateField.define<boolean>({
  create() {
    return false;
  },

  update(value, transaction) {
    // Check if showQuickEditEffect was dispatched
    for (const effect of transaction.effects) {
      if (effect.is(showQuickEditEffect)) {
        value = effect.value; // Turn form on/off
      }
    }
    // If selection becomes empty, automatically close form
    if (transaction.selection) {
      const selection = transaction.state.selection.main;
      if (selection.empty) {
        value = false;
      }
    }
    return value;
  },
});

/**
 * UI - FORM CREATION
 * ==================
 * Creates the DOM structure for the form that appears when user clicks "Quick Edit"
 */

const createQuickEditToolTip = (state: EditorState): readonly Tooltip[] => {
  const selection = state.selection.main;
  if (selection.empty) return [];

  const isQuickEditActive = state.field(quickEditState);
  if (!isQuickEditActive) return [];

  // Preserve the range selected when opening Quick Edit, so submit doesn't depend
  // on current focus/selection state.
  quickEditRange = { from: selection.from, to: selection.to };

  return [
    {
      pos: selection.to,
      above: false,
      strictSide: false,
      create() {
        const dom = document.createElement("div");
        dom.className =
          "bg-popover text-popover-foreground z-50 rounded-sm border border-input p-2 shadow-md flex flex-col gap-2 text-sm";

        const form = document.createElement("form");
        form.className = "flex flex-col gap-2";

        const input = document.createElement("input");
        input.type = "text";
        input.placeholder = "Edit selected code";
        input.className =
          "bg-transparent border-none outline-none px-2 py-1 font-sans w-100";
        input.autofocus = true;

        const buttonContainer = document.createElement("div");
        buttonContainer.className = "flex items-center justify-between gap-2";

        const cancelButton = document.createElement("button");
        cancelButton.type = "button";
        cancelButton.textContent = "Cancel";
        cancelButton.className =
          "font-sans p-1 px-2 text-muted-foreground hover:text-foreground hover:bg-foreground/10 rounded-sm";
        cancelButton.onclick = () => {
          if (currentAbortController) {
            currentAbortController.abort();
            currentAbortController = null;
          }
          quickEditRange = null;
          if (editorView) {
            editorView.dispatch({
              effects: showQuickEditEffect.of(false),
            });
          }
        };

        const submitButton = document.createElement("button");
        submitButton.type = "submit";
        submitButton.textContent = "Submit";
        submitButton.className =
          "font-sans p-1 px-2 text-muted-foreground hover:text-foreground hover:bg-foreground/10 rounded-sm";

        form.onsubmit = async (e) => {
          e.preventDefault();

          if (!editorView) return;

          const instruction = input.value.trim();
          if (!instruction) return;

          const selection = quickEditRange ?? editorView.state.selection.main;
          const docLength = editorView.state.doc.length;
          const from = Math.max(0, Math.min(selection.from, docLength));
          const to = Math.max(from, Math.min(selection.to, docLength));

          if (from === to) {
            toast.error("Select code before using Quick Edit");
            submitButton.disabled = false;
            submitButton.textContent = "Submit";
            return;
          }

          const selectedCode = editorView.state.doc.sliceString(from, to);
          const fullCode = editorView.state.doc.toString();

          submitButton.disabled = true;
          submitButton.textContent = "Editing...";

          currentAbortController = new AbortController();
          const result = await fetchEditedCode(
            {
              selectedCode,
              fullCode,
              instruction,
            },
            currentAbortController.signal,
          );

          if (result !== null) {
            if (result.noChange) {
              toast.info("Quick Edit made no changes to the selected code");
              submitButton.disabled = false;
              submitButton.textContent = "Submit";
              currentAbortController = null;
              return;
            }

            editorView.dispatch({
              changes: {
                from,
                to,
                insert: result.editedCode,
              },
              selection: { anchor: from + result.editedCode.length },
              effects: showQuickEditEffect.of(false),
            });
            quickEditRange = null;
          } else {
            submitButton.disabled = false;
            submitButton.textContent = "Submit";
          }

          currentAbortController = null;
        };

        buttonContainer.appendChild(cancelButton);
        buttonContainer.appendChild(submitButton);

        form.appendChild(input);
        form.appendChild(buttonContainer);

        dom.appendChild(form);

        setTimeout(() => {
          input.focus();
        }, 0);

        return { dom };
      },
    },
  ];
};

const quickEditTooltipField = StateField.define<readonly Tooltip[]>({
  create(state) {
    return createQuickEditToolTip(state);
  },
  update(tooltips, transaction) {
    if (transaction.docChanged || transaction.selection) {
      return createQuickEditToolTip(transaction.state);
    }
    for (const effect of transaction.effects) {
      if (effect.is(showQuickEditEffect)) {
        return createQuickEditToolTip(transaction.state);
      }
    }
    return tooltips;
  },
  provide: (field) =>
    showTooltip.computeN([field], (state) => state.field(field)),
});

/**
 * KEYBOARD SHORTCUT
 * =================
 * ⌘K (Cmd+K on Mac, Ctrl+K on Windows) opens the quick-edit form
 */

const quickEditKeymap = keymap.of([
  {
    key: "Mod-k", // "Mod" = Cmd on Mac, Ctrl on Windows
    run: (view) => {
      const selection = view.state.selection.main;
      // Only show form if text is selected
      if (selection.empty) return false;

      // Dispatch effect to show the form
      quickEditRange = { from: selection.from, to: selection.to };
      view.dispatch({
        effects: showQuickEditEffect.of(true),
      });
      return true;
    },
  },
]);

/**
 * CAPTURE EDITOR REFERENCE
 * ========================
 * Store a reference to the current editor view so we can dispatch changes
 * when form is submitted (replace selected code with edited version)
 */

const captureViewExtension = EditorView.updateListener.of((update) => {
  editorView = update.view;
});

/**
 * EXPORT
 * ======
 * Export the complete extension as an array for use in editor
 */

export const quickEdit = () => [
  quickEditState, // State field: tracks if form is open
  quickEditTooltipField, // Tooltip field: renders the form
  quickEditKeymap, // Keyboard shortcut: ⌘K
  captureViewExtension, // Capture view: store editor reference
];
