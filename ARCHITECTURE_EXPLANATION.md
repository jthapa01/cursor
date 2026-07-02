# AI Code Editor Architecture - Complete Explanation

## 🎯 Overview
This system works like a clock with multiple gears, each synchronized to create a seamless code editing experience. There are **two main features**:
1. **Suggestion System** - AI-powered code completion as you type
2. **Quick Edit System** - AI-powered code transformation based on instructions

---

## 📊 Data Flow Diagram

```
USER TYPING
    ↓
[Editor View] (CodeMirror)
    ↓
┌─────────────────────────────────────────────────────────────┐
│                    SUGGESTION FEATURE                       │
├─────────────────────────────────────────────────────────────┤
│ 1. Edit detected (debounce 300ms)                           │
│ 2. Extract context (previous/next lines, cursor position)   │
│ 3. Send to /api/suggestion                                  │
│ 4. Get AI suggestion back                                   │
│ 5. Display as ghost text (semi-transparent)                 │
│ 6. User presses Tab/Enter to accept or keeps typing         │
└─────────────────────────────────────────────────────────────┘

USER SELECTS CODE
    ↓
[Selection Tooltip appears] with "Quick Edit" button
    ↓
┌─────────────────────────────────────────────────────────────┐
│                    QUICK EDIT FEATURE                       │
├─────────────────────────────────────────────────────────────┤
│ 1. User clicks "Quick Edit" button or presses ⌘K           │
│ 2. Form appears: input field for instructions              │
│ 3. User types: "make this async" or "add error handling"  │
│ 4. User clicks Submit                                       │
│ 5. Send to /api/quick-edit with:                           │
│    - selectedCode: the code to edit                         │
│    - fullCode: full file context                            │
│    - instruction: what to do with it                        │
│    - Plus any URLs in instruction (for docs scraping)       │
│ 6. Get edited code back from AI                             │
│ 7. Replace selected code with edited version               │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔧 Component Breakdown (Like Clock Gears)

### TIER 1: API Routes (Backend - Server Side)

#### `/api/suggestion/route.ts`
**Purpose:** Generates code completions as you type

**How it works:**
```
Input: {
  fileName: "App.tsx",
  code: "const sum = (a, b) => {",
  currentLine: "  return a +",
  lineNumber: 2,
  textBeforeCursor: "  return a +",
  textAfterCursor: "",
  previousLines: "const sum = (a, b) => {",
  nextLines: ""
}
    ↓
Step 1: Check if user is authenticated (Clerk)
Step 2: Validate input using Zod schema
Step 3: Build context-aware prompt with:
        - File context (previous/current/next lines)
        - Full code for understanding
Step 4: Call Claude AI with smart instructions:
        - Don't suggest if code already exists below cursor
        - Don't suggest if line already complete (ends with ; or })
Step 5: Return: { suggestion: "b" }
```

**Key Logic:**
- The prompt has 3 intelligence gates (steps 1-3 in instructions)
- This prevents duplicate suggestions
- Uses Zod for runtime validation

---

#### `/api/quick-edit/route.ts`
**Purpose:** Edits selected code based on AI instructions

**How it works:**
```
Input: {
  selectedCode: "function getData() { return fetch('/api/data'); }",
  fullCode: "// entire file content",
  instruction: "make this async"
}
    ↓
Step 1: Check authentication
Step 2: Extract any URLs from instruction
Step 3: If URLs found, scrape them (use Firecrawl):
        - Get documentation from those URLs
        - Add context to AI prompt
Step 4: Build prompt with:
        - Original selected code
        - Full file context
        - Optional documentation
        - User instruction
Step 5: Call Claude AI to transform code
Step 6: Return: { editedCode: "async function getData() { ... }" }
```

**Special Feature:** URL Scraping
- If user says: "make this async according to https://..."
- The system automatically fetches that page and adds its content to the AI prompt
- This helps AI make informed edits based on real documentation

---

### TIER 2: Fetchers (Frontend - Network Layer)

These are lightweight HTTP clients that talk to the API routes.

#### `suggestion/fetcher.ts`
**What it does:** HTTP client for suggestion API

```typescript
// Takes payload from editor → sends to backend → gets suggestion
fetchSuggestion(payload, signal)
  ↓
  Validates payload with Zod
  ↓
  POST to /api/suggestion (with 10 second timeout)
  ↓
  Validates response with Zod
  ↓
  Returns suggestion string or null
  ↓
  If network fails: show toast error
```

**Error Handling:**
- AbortError (user cancelled) → return null silently
- Network error → show toast message
- Validation error → show error toast

---

#### `quick-edit/fetcher.ts`
**What it does:** HTTP client for quick-edit API

Same pattern as suggestion, but:
- 30 second timeout (longer because it may scrape URLs)
- Handles edit requests
- Shows error toast on failure

---

### TIER 3: Extensions (Frontend - Editor Integration)

These plug into CodeMirror editor to create UI and handle interactions.

#### `selection-tooltip.ts`
**Purpose:** Shows a tooltip with buttons when user selects text

**How it works - Step by Step:**

```
STEP 1: Create State Field
├─ Holds array of Tooltips to display
└─ Updates when selection changes or quick-edit toggles

STEP 2: Create Tooltip Content
├─ When selection exists and NOT empty:
│  └─ Show tooltip below selection with 2 buttons:
│     - "Add to Chat" (for later integration)
│     - "Quick Edit" with ⌘K shortcut
├─ When quick edit active:
│  └─ Hide tooltip (to show form instead)
└─ When no selection:
   └─ Hide tooltip

STEP 3: Handle Button Click
├─ "Quick Edit" button clicked
└─ Dispatch effect: showQuickEditEffect.of(true)
   └─ This triggers quick-edit form to appear

STEP 4: Provide to Editor
└─ Register tooltip field with CodeMirror
   └─ CodeMirror renders tooltip at cursor position
```

**Code Flow:**
```typescript
createTooltipForSelection() // Create tooltip UI
    ↓
selectionTooltipField (StateField) // Manage tooltip state
    ↓
captureViewExtension // Store editor reference
    ↓
selectionTooltip() // Export as extension array
```

---

#### `quick-edit/index.ts`
**Purpose:** Form overlay for editing code with AI

**How it works - Step by Step:**

```
STEP 1: State Management
├─ showQuickEditEffect: triggers form visibility
└─ quickEditState: tracks if form is open

STEP 2: Create Form (createQuickEditToolTip)
├─ Structure:
│  └─ DIV (container)
│     ├─ FORM
│     │  ├─ INPUT (for user instruction)
│     │  └─ DIV (buttons)
│     │     ├─ CANCEL button
│     │     └─ SUBMIT button
│
└─ Styling: dark popover style with border and shadow

STEP 3: Handle Form Submission
├─ User types instruction: "make this async"
├─ User clicks Submit
├─ Handler:
│  ├─ Get selected code from editor
│  ├─ Get full code for context
│  ├─ Call fetchEditedCode()
│  ├─ Show "Editing..." button state
│  ├─ Wait for response
│  └─ Replace selection with edited code
│
└─ Hide form when done

STEP 4: Handle Cancel
├─ User clicks Cancel OR presses Escape
├─ Abort any pending request
└─ Hide form

STEP 5: Provide to Editor
├─ quickEditTooltipField: manages form state
└─ Register with CodeMirror
```

**Key Variables:**
- `editorView`: stored reference to editor (to dispatch changes)
- `currentAbortController`: cancels in-flight requests

---

#### `suggestion/index.ts` (INCOMPLETE - WILL FIX)
**Purpose:** Displays inline code suggestions as you type

**How it should work - Step by Step:**

```
STEP 1: State Management
├─ suggestionState: holds current suggestion text
├─ setSuggestionEffect: effect to update suggestion
└─ StateField: tells CodeMirror to track this state

STEP 2: Plugin - Generate Suggestions
├─ Debounce Plugin (createDebouncePlugin)
│  ├─ Wait 300ms after user stops typing
│  ├─ Build payload from editor context
│  ├─ Call fetchSuggestion()
│  ├─ Dispatch suggestion via setSuggestionEffect
│  └─ Store result in suggestionState
│
└─ Handles cleanup on destroy

STEP 3: Plugin - Render Suggestions
├─ Render Plugin (renderPlugin)
│  ├─ Read suggestion from suggestionState
│  ├─ Create decoration (ghost text widget)
│  ├─ Position it at cursor
│  ├─ Apply semi-transparent styling
│  └─ Return DecorationSet to CodeMirror
│
└─ Updates when:
   ├─ Document changes (user types)
   ├─ Cursor moves
   └─ Suggestion changes

STEP 4: Widget Rendering
├─ SuggestionWidget class
│  ├─ toDOM(): creates <span> with ghost text
│  ├─ Styling: opacity 0.4 (faded)
│  └─ pointerEvents: none (don't interfere)
│
└─ Inserted at cursor position

STEP 5: Accept Suggestion
└─ User presses Tab (handled elsewhere)
   └─ Replaces decoration with actual text
```

---

## 📋 File Structure Summary

```
src/
├─ app/api/
│  ├─ suggestion/
│  │  └─ route.ts (Backend: generates suggestions)
│  │
│  └─ quick-edit/
│     └─ route.ts (Backend: edits code based on instructions)
│
└─ features/editor/extensions/
   ├─ suggestion/
   │  ├─ index.ts (Frontend: displays inline suggestions)
   │  └─ fetcher.ts (HTTP client for suggestions)
   │
   ├─ quick-edit/
   │  ├─ index.ts (Frontend: edit form UI & logic)
   │  └─ fetcher.ts (HTTP client for quick edits)
   │
   └─ selection-tooltip.ts (Frontend: floating toolbar on selection)
```

---

## 🎬 Complete User Journey

### Feature 1: Auto-completion (Suggestion)

1. User opens file in editor
2. User types: `const name = ` and pauses
3. **300ms debounce timer** starts counting
4. Suggestion plugin calls `generatePayload()` → extracts context
5. Calls `fetchSuggestion()` → hits `/api/suggestion`
6. Backend Claude AI thinks: "They're probably assigning a string, suggest a name"
7. Returns: `""; (or similar)`
8. Plugin creates `SuggestionWidget` with text
9. Renders as ghost text at cursor (semi-transparent)
10. User sees faded suggestion
11. User presses Tab → suggestion becomes real text ✅
12. OR user keeps typing → suggestion disappears

### Feature 2: Quick Edit

1. User selects: `function getData() { fetch('/api') }`
2. Selection tooltip appears below with "Quick Edit" button
3. User clicks "Quick Edit" button
4. Form appears with input field
5. User types: `make this async with error handling`
6. User clicks Submit
7. Button shows "Editing..." while waiting
8. Backend scrapes any URLs (if instruction mentioned them)
9. Claude AI reads selected code + full context + instruction
10. Returns edited version: `async function getData() { try { await fetch... } catch(e) { ... } }`
11. Selected text replaced with edited version ✅
12. Form disappears

---

## 🔐 Security & Validation

All inputs go through **Zod schema validation**:
- Backend validates before calling AI
- Frontend validates before sending
- Prevents type errors and malicious input

All requests:
- Require authentication (Clerk)
- Have timeouts (10s for suggestion, 30s for edit)
- Can be aborted (user closes form)

---

## ⚡ Performance Tricks

1. **Debouncing (Suggestion)**
   - Waits 300ms after typing stops before fetching
   - Prevents hammering API on every keystroke
   - Aborts previous request if user types again

2. **Abort Controller**
   - User closes form → abort request immediately
   - No wasted requests, no race conditions

3. **Validation**
   - Doesn't suggest if code already written below
   - Doesn't suggest if line already complete
   - Smart prompting = fewer unnecessary suggestions

---

## 🛠️ Technologies Used

| Layer | Tech | Purpose |
|-------|------|---------|
| Backend | Node.js/Next.js | API routes |
| Backend | Claude 3.5 Sonnet | AI engine |
| Backend | Firecrawl | URL scraping for docs |
| Frontend | CodeMirror 6 | Editor integration |
| Frontend | Zod | Runtime validation |
| Frontend | ky | HTTP client |
| Frontend | Sonner | Toast notifications |
| Auth | Clerk | User authentication |

---

## 🎓 Key Learning Points

1. **State Effects**: CodeMirror uses `StateEffect` to communicate state changes
2. **Decorations**: Visual overlays (ghost text) rendered via `DecorationSet`
3. **Debouncing**: Prevents excessive API calls during active editing
4. **Abort Signals**: Cancel in-flight requests when user takes action
5. **Validation**: Zod ensures data integrity at network boundaries
6. **Event-Driven**: Everything reacts to editor state changes
