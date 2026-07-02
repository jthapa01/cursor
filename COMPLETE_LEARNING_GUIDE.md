# 🎓 Complete Learning Guide: AI Code Editor System

## Quick Summary
This project has **3 main folders** that work together:

```
🏗️  Architecture (Like a Clock)

┌─────────────────────────────────────────┐
│         Frontend (Browser)              │
├─────────────────────────────────────────┤
│  selection-tooltip.ts                   │ ← Shows "Quick Edit" button when you select code
│  quick-edit/index.ts                    │ ← Shows form for editing instructions
│  suggestion/index.ts                    │ ← Shows ghost text suggestions
└─────────────────────────────────────────┘
              ↕ HTTP
┌─────────────────────────────────────────┐
│         Backend (Server)                │
├─────────────────────────────────────────┤
│  /api/suggestion/route.ts               │ ← AI generates code completions
│  /api/quick-edit/route.ts               │ ← AI edits code based on instructions
└─────────────────────────────────────────┘
```

---

## 📚 File-by-File Breakdown

### 1️⃣ `src/app/api/suggestion/route.ts` - Backend Suggestion Engine

**What it does:** When you type code and pause, it generates AI suggestions.

**Step-by-Step:**
```
User: Types "const x = "  ← pause for 300ms

BACKEND:
Step 1: Check authentication (is user logged in?)
        ↓
Step 2: Validate that code was provided
        ↓
Step 3: Build a prompt with:
        - Full file content
        - Previous lines (context)
        - Current line
        - Text before cursor
        - Text after cursor
        - Next lines (context)
        ↓
Step 4: Call Claude AI with 3 intelligent instructions:
        "IF next_lines has code that continues → return empty string"
        "IF line already ends with ; or } → return empty string"
        "ELSE → suggest what should come next"
        ↓
Step 5: Return { suggestion: "123;" }

Frontend receives suggestion and displays as ghost text
```

**Smart Logic Examples:**
```javascript
// Scenario 1: Already written
User types: const x = 
Line below: const x = 42;
API returns: "" (empty - already written below!)

// Scenario 2: Line complete
User types: const x = 42;
API returns: "" (empty - line is complete with ;)

// Scenario 3: New assignment
User types: const x = 
No code below
API returns: "123;" or similar
```

---

### 2️⃣ `src/app/api/quick-edit/route.ts` - Backend Edit Engine

**What it does:** Takes selected code + instruction → returns edited version

**Step-by-Step:**
```
User: Selects "function getData() { return fetch('/api'); }"
      Types instruction: "make this async"
      Clicks Submit

BACKEND:
Step 1: Verify user is authenticated
        ↓
Step 2: Check all required fields exist:
        - selectedCode ✓
        - fullCode ✓
        - instruction ✓
        ↓
Step 3: Extract URLs from instruction
        Regex finds: none in this example
        (But if user said "according to https://...", it would scrape it)
        ↓
Step 4: Build prompt with:
        <selected_code>
        function getData() { return fetch('/api'); }
        </selected_code>
        
        <full_code_context>
        (entire file)
        </full_code_context>
        
        {documentation} ← empty if no URLs scraped
        
        <instruction>
        make this async
        </instruction>
        ↓
Step 5: Call Claude AI (with structured output)
        AI thinks: "They want async, so add async keyword"
        "They want to fetch async data, use await"
        "Handle errors with try-catch"
        ↓
Step 6: Return { editedCode: "async function getData() { ... }" }

Frontend receives edited code and replaces selection
```

**Special Feature - URL Scraping:**
```javascript
// If user types instruction with URL:
instruction = "make this async following https://nodejs.org/async"

System:
1. Extracts URLs: ["https://nodejs.org/async"]
2. Scrapes content using Firecrawl library
3. Adds content to prompt:
   <documentation>
   <doc url="https://nodejs.org/async">
   [markdown content of that page]
   </doc>
   </documentation>
4. Claude sees documentation + knows best practices
5. Returns more accurate edited code!
```

---

### 3️⃣ `src/features/editor/extensions/suggestion/fetcher.ts` - HTTP Client

**What it does:** Calls the `/api/suggestion` endpoint

```typescript
export const fetchSuggestion = async (payload, signal) => {
  // payload = {
  //   fileName, code, currentLine, previousLines,
  //   textBeforeCursor, textAfterCursor, nextLines, lineNumber
  // }

  try {
    // Validate payload shape matches schema
    const validatedPayload = suggestionRequestSchema.parse(payload);
    
    // Send HTTP POST to /api/suggestion
    const response = await ky.post("/api/suggestion", {
      json: validatedPayload,
      signal,              // Can be aborted
      timeout: 10_000,     // 10 second timeout
      retry: 0,            // Don't retry
    }).json();
    
    // Validate response shape
    const validatedResponse = suggestionResponseSchema.parse(response);
    
    // Return suggestion or null
    return validatedResponse.suggestion || null;
    
  } catch (error) {
    if (error.name === "AbortError") {
      return null;  // User cancelled, don't show error
    }
    toast.error("Failed to fetch AI completion");
    return null;
  }
};
```

**Key Details:**
- `signal: AbortSignal` → allows cancellation
- `timeout: 10_000` → fail if no response in 10 seconds
- Zod validation → ensures data integrity
- Toast error → user sees what went wrong

---

### 4️⃣ `src/features/editor/extensions/quick-edit/fetcher.ts` - HTTP Client

**What it does:** Calls the `/api/quick-edit` endpoint

```typescript
export const fetchEditedCode = async (payload, signal) => {
  // payload = {
  //   selectedCode: "function foo() {...}",
  //   fullCode: "entire file",
  //   instruction: "make this async"
  // }

  try {
    const validatedPayload = editRequestSchema.parse(payload);
    
    const response = await ky.post("/api/quick-edit", {
      json: validatedPayload,
      signal,
      timeout: 30_000,     // 30 second timeout (longer - might scrape URLs)
      retry: 0,
    }).json();
    
    const validatedResponse = editResponseSchema.parse(response);
    return validatedResponse.editedCode || null;
    
  } catch (error) {
    if (error.name === "AbortError") return null;
    toast.error("Failed to fetch AI quick edit");
    return null;
  }
};
```

**Differences from suggestion:**
- 30 second timeout (vs 10 for suggestion)
- Reason: May need to scrape URLs, takes longer

---

### 5️⃣ `src/features/editor/extensions/selection-tooltip.ts` - Selection Toolbar

**What it does:** Shows floating buttons when you select text

**Flow:**
```
User selects text
    ↓
selection-tooltip.ts detects selection
    ↓
Creates tooltip with 2 buttons:
┌──────────────────────────────┐
│ [Add to Chat] [Quick Edit ⌘K]│  ← floating toolbar
└──────────────────────────────┘
    ↓
User clicks "Quick Edit" button
    ↓
Dispatches effect: showQuickEditEffect.of(true)
    ↓
quick-edit/index.ts receives effect
    ↓
Form appears below selection
```

**Code Structure:**
```typescript
// StateField: Manages tooltip state
const selectionTooltipField = StateField.define({
  create(state) {
    return createTooltipForSelection(state);
  },
  update(tooltips, transaction) {
    // Recreate tooltip if doc changed or selection changed
    if (transaction.docChanged || transaction.selection) {
      return createTooltipForSelection(transaction.state);
    }
    // Check if quick-edit was activated
    for (const effect of transaction.effects) {
      if (effect.is(showQuickEditEffect)) {
        // Toggle tooltip visibility
        return createTooltipForSelection(transaction.state);
      }
    }
    return tooltips;
  },
  provide: (field) => showTooltip.computeN(
    [field],
    (state) => state.field(field)
  )
});

// Extension setup
export const selectionTooltip = () => [
  selectionTooltipField,
  EditorView.updateListener.of((update) => {
    editorView = update.view; // Store editor reference
  })
];
```

---

### 6️⃣ `src/features/editor/extensions/quick-edit/index.ts` - Edit Form UI

**What it does:** Shows form when user selects code and presses ⌘K

**Visual Flow:**
```
User selects: "function foo() {}"
    ↓
Clicks "Quick Edit" or presses ⌘K
    ↓
Form appears:
┌──────────────────────────────┐
│ Edit selected code           │
│ [input: _______________     ]│
│ [Cancel] [Submit]            │
└──────────────────────────────┘
    ↓
User types: "make this async"
    ↓
Clicks Submit
    ↓
Button shows "Editing..."
    ↓
Form fetches edited code from API
    ↓
Selected text replaced with edited version
    ↓
Form closes
```

**State Management:**
```typescript
// StateEffect: toggle form visibility
export const showQuickEditEffect = StateEffect.define<boolean>();

// StateField: track if form is open
export const quickEditState = StateField.define<boolean>({
  create() {
    return false;  // Form starts hidden
  },
  update(value, transaction) {
    // Check if showQuickEditEffect was dispatched
    for (const effect of transaction.effects) {
      if (effect.is(showQuickEditEffect)) {
        value = effect.value;  // Toggle on/off
      }
    }
    // Auto-close if selection becomes empty
    if (transaction.selection) {
      const selection = transaction.state.selection.main;
      if (selection.empty) {
        value = false;
      }
    }
    return value;
  }
});
```

**Form Submission:**
```typescript
form.onsubmit = async (e) => {
  e.preventDefault();
  
  // Get instruction from input
  const instruction = input.value.trim();
  
  // Get selected code
  const selectedCode = editorView.state.doc.sliceString(
    selection.from,
    selection.to
  );
  
  // Get full file context
  const fullCode = editorView.state.doc.toString();
  
  // Show loading state
  submitButton.textContent = "Editing...";
  
  // Call API
  const editedCode = await fetchEditedCode(
    { selectedCode, fullCode, instruction },
    abortSignal
  );
  
  // Replace selected code
  editorView.dispatch({
    changes: {
      from: selection.from,
      to: selection.to,
      insert: editedCode
    },
    effects: showQuickEditEffect.of(false)  // Close form
  });
};
```

---

### 7️⃣ `src/features/editor/extensions/suggestion/index.ts` - Suggestion Display

**What it does:** Shows ghost text suggestions as you type

**Full Clock Breakdown:**

```
⏰ TICK 1: User Types
   Editor detects keystroke
   
⏰ TICK 2: Debounce Plugin Waits
   Timer starts (300ms countdown)
   If user types again → restart timer
   
⏰ TICK 3: 300ms Passes
   Generate payload from editor:
   - Full file code
   - Previous 5 lines
   - Current line
   - Text before cursor
   - Text after cursor
   - Next 5 lines
   
⏰ TICK 4: Fetch Suggestion
   Call fetchSuggestion() → /api/suggestion
   Abort controller ready if user types again
   
⏰ TICK 5: Dispatch Effect
   Result arrives from API
   Dispatch setSuggestionEffect.of(suggestion)
   
⏰ TICK 6: Render Plugin Updates
   Reads suggestion from state
   Creates SuggestionWidget
   Places decoration at cursor
   
⏰ TICK 7: Display Ghost Text
   User sees faded suggestion in editor
   
⏰ TICK 8: User Action
   Option A: Press Tab → accept suggestion
   Option B: Press Escape → dismiss suggestion
   Option C: Keep typing → suggestion disappears
```

**Code Structure:**
```typescript
// 1. State: holds current suggestion
const suggestionState = StateField.define<string | null>({
  create() { return null; },
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setSuggestionEffect)) {
        return effect.value;
      }
    }
    return value;
  }
});

// 2. UI: creates the visual widget
class SuggestionWidget extends WidgetType {
  toDOM() {
    const span = document.createElement("span");
    span.textContent = this.text;
    span.style.opacity = "0.4";  // Ghost text
    return span;
  }
}

// 3. Debounce Plugin: waits 300ms
const createDebouncePlugin = (fileName) => {
  return ViewPlugin.fromClass(class {
    constructor(view) {
      this.triggerSuggestion(view);
    }
    update(update) {
      if (update.docChanged || update.selectionSet) {
        this.triggerSuggestion(update.view);
      }
    }
    triggerSuggestion(view) {
      // Clear old timer
      if (debounceTimer) clearTimeout(debounceTimer);
      
      // Set new timer
      debounceTimer = setTimeout(async () => {
        const payload = generatePayload(view, fileName);
        const suggestion = await fetchSuggestion(payload, signal);
        view.dispatch({
          effects: setSuggestionEffect.of(suggestion)
        });
      }, 300);
    }
  });
};

// 4. Render Plugin: displays decorations
const renderPlugin = ViewPlugin.fromClass(class {
  decorations;
  
  constructor(view) {
    this.decorations = this.build(view);
  }
  
  build(view) {
    const suggestion = view.state.field(suggestionState);
    if (!suggestion) return Decoration.none;
    
    const cursor = view.state.selection.main.head;
    return Decoration.set([
      Decoration.widget({
        widget: new SuggestionWidget(suggestion),
        side: 1  // render after cursor
      }).range(cursor)
    ]);
  }
  
  update(update) {
    if (update.docChanged || update.selectionSet) {
      this.decorations = this.build(update.view);
    }
  }
}, { decorations: (plugin) => plugin.decorations });

// 5. Keyboard: Tab to accept, Escape to dismiss
const acceptSuggestionKeymap = keymap.of([
  {
    key: "Tab",
    run: (view) => {
      const suggestion = view.state.field(suggestionState);
      if (!suggestion) return false;
      
      const cursor = view.state.selection.main.head;
      view.dispatch({
        changes: { from: cursor, insert: suggestion },
        selection: { anchor: cursor + suggestion.length },
        effects: setSuggestionEffect.of(null)
      });
      return true;
    }
  }
]);

// 6. Export
export const suggestionExtension = (fileName) => [
  suggestionState,
  createDebouncePlugin(fileName),
  renderPlugin,
  acceptSuggestionKeymap
];
```

---

## 🔄 Complete User Journey

### Journey 1: Auto-completion (Suggestion)

```
1. User opens file "App.tsx" in editor
   
2. User types: "const name = "
   
3. After 300ms pause:
   ✓ Debounce plugin triggers
   ✓ Generates payload with context
   ✓ Fetches from /api/suggestion
   
4. API responds: { suggestion: "\"John\"" }
   
5. Suggestion state updates
   
6. Render plugin creates decoration
   
7. User sees: const name = "John"
                        └─ faded ghost text
   
8. User presses Tab
   
9. Ghost text becomes real
   
10. Result: const name = "John"
```

### Journey 2: Quick Edit

```
1. User selects code:
   "function getData() { return fetch('/api'); }"
   
2. Selection tooltip appears below:
   ┌──────────────────────────────┐
   │ [Add to Chat] [Quick Edit ⌘K]│
   └──────────────────────────────┘
   
3. User clicks "Quick Edit" button
   
4. showQuickEditEffect.of(true) dispatched
   
5. Quick edit form appears:
   ┌──────────────────────────────┐
   │ Edit selected code           │
   │ [input: _______________     ]│
   │ [Cancel] [Submit]            │
   └──────────────────────────────┘
   
6. User types: "make this async"
   
7. User clicks Submit
   
8. Form shows: [Submit →]  "Editing..."
   
9. Request sent to /api/quick-edit with:
   {
     selectedCode: "function getData()...",
     fullCode: "(entire file)",
     instruction: "make this async"
   }
   
10. API scrapes any URLs (none in this case)
    Calls Claude AI with context
    Returns: {
      editedCode: "async function getData() { try { await fetch... } catch(e) {...} }"
    }
    
11. Selected code replaced with edited version
    
12. Form closes
    
13. Result: edited code is in selection
```

---

## 🎯 Key Concepts Explained

### StateField vs StateEffect

**StateEffect** = Message/Signal
- "Hey, update the state to this new value"
- One-time message
- Example: `setSuggestionEffect.of("suggestion text")`

**StateField** = Container
- "I hold the current state value"
- Responds to effects
- Remembers value across transactions
- Example: `suggestionState` holds the current suggestion

**Analogy:**
```
StateField = Email inbox
StateEffect = New email arriving

When email arrives (effect), inbox updates (field)
```

### Decorations vs Widgets

**Decoration** = Visual overlay in editor
- "Mark this region with styling"
- Example: highlight, underline, etc.

**Widget** = Custom DOM element
- "Display this HTML element in the editor"
- Example: ghost text suggestion

**Code:**
```typescript
Decoration.widget({
  widget: new SuggestionWidget("text"),  // Custom DOM
  side: 1  // Position
}).range(position)  // Where to show
```

### Debouncing

**Problem:** API called on every keystroke = wasteful

**Solution:** Wait for user to stop typing

```
User typing: d-e-f-i-n-e-PAUSE
                             ↑ (now fetch)

Not: d(fetch)-e(fetch)-f(fetch)-i(fetch)...
```

---

## 🚀 How to Use

### In Your Editor:

**Feature 1 - Auto-suggestion:**
```
1. Start typing code
2. Pause for 300ms
3. See faded suggestion appear
4. Press Tab to accept
5. Press Escape to dismiss
```

**Feature 2 - Quick Edit:**
```
1. Select some code
2. See toolbar appear with "Quick Edit" button
3. Click it (or press ⌘K)
4. Type your instruction
5. Click Submit
6. Code gets edited by AI
```

---

## ✅ Errors Fixed

| File | Error | Fix |
|------|-------|-----|
| `suggestion/index.ts` | Missing `build()` method | Added complete implementation |
| `suggestion/index.ts` | Incomplete `update()` | Finished the method properly |
| `suggestion/index.ts` | Unused imports | Removed unused imports |
| `quick-edit/index.ts` | Unused parameter | Removed unused `fileName` param |

---

## 📊 Architecture Summary

```
┌──────────────────────────────────────────────────────┐
│         CodeMirror Editor View                       │
├──────────────────────────────────────────────────────┤
│                                                      │
│  [selectionTooltip] ←─── Detects selection         │
│         ↓                                            │
│    Shows buttons → "Quick Edit"                      │
│         ↓                                            │
│  [quickEdit] ←─── User clicks button                │
│         ↓                                            │
│    Shows form → User types instruction              │
│         ↓                                            │
│    [fetchEditedCode()] → HTTP → /api/quick-edit     │
│         ↓                                            │
│  API returns edited code                            │
│         ↓                                            │
│  Selection replaced with new code                   │
│                                                      │
│  ════════════════════════════════════════════════    │
│                                                      │
│  [suggestionExtension] ←─── Detects typing          │
│         ↓                                            │
│    300ms debounce waits                             │
│         ↓                                            │
│    [fetchSuggestion()] → HTTP → /api/suggestion     │
│         ↓                                            │
│  API returns suggestion                             │
│         ↓                                            │
│  Ghost text displayed at cursor                     │
│         ↓                                            │
│  User presses Tab to accept                         │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

## 🎓 Learning Points

1. **State Management**: CodeMirror uses StateField + StateEffect pattern
2. **Debouncing**: Prevents excessive API calls
3. **Async Operations**: AbortController for cancellation
4. **Validation**: Zod ensures data integrity
5. **Event-Driven**: Everything reacts to editor changes
6. **DOM Manipulation**: Creating custom widgets
7. **HTTP Communication**: Fetching from APIs with timeouts
