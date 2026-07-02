# 📋 Quick Reference Guide

## 🔗 All Files in the System

### Backend Files (Server)

**`src/app/api/suggestion/route.ts`**
- **Purpose**: Generate code completions
- **Method**: POST
- **Input**: `{ fileName, code, currentLine, previousLines, textBeforeCursor, textAfterCursor, nextLines, lineNumber }`
- **Output**: `{ suggestion: "text" }`
- **AI Model**: Claude 3.5 Sonnet
- **Timeout**: 10 seconds
- **Special**: Uses Firecrawl to scrape docs if URLs found

**`src/app/api/quick-edit/route.ts`**
- **Purpose**: Edit code based on instructions
- **Method**: POST
- **Input**: `{ selectedCode, fullCode, instruction }`
- **Output**: `{ editedCode: "transformed text" }`
- **AI Model**: Claude 3.5 Sonnet
- **Timeout**: 30 seconds
- **Special**: Scrapes URLs mentioned in instruction

### Frontend Files (Browser)

**`src/features/editor/extensions/selection-tooltip.ts`**
- **Purpose**: Show floating toolbar when text is selected
- **Button 1**: "Add to Chat" (for future feature)
- **Button 2**: "Quick Edit ⌘K" (triggers form)
- **Key Components**: `StateField`, `Tooltip`, `showTooltip`
- **Triggers**: Text selection
- **Result**: Floating buttons below selection

**`src/features/editor/extensions/quick-edit/index.ts`**
- **Purpose**: Form for editing selected code
- **Triggered By**: User clicks "Quick Edit" button or presses ⌘K
- **Form Fields**: 
  - Text input (for instruction)
  - Cancel button
  - Submit button
- **Key Components**: `StateField` (quickEditState), `StateEffect` (showQuickEditEffect), `Tooltip`
- **On Submit**: Calls API, replaces selected code
- **Special**: AbortController for cancellation, loading state

**`src/features/editor/extensions/suggestion/index.ts`** ✅ **FIXED**
- **Purpose**: Display ghost text suggestions as you type
- **Triggered By**: User types and pauses for 300ms
- **Display**: Semi-transparent text at cursor (opacity 0.4)
- **Key Components**: `StateField` (suggestionState), `StateEffect` (setSuggestionEffect), `ViewPlugin`, `Decoration`, `WidgetType`, `keymap`
- **Keyboard Shortcuts**:
  - Tab: Accept suggestion
  - Escape: Dismiss suggestion
- **Debounce**: 300ms
- **On Keystroke**: Timer resets

**`src/features/editor/extensions/quick-edit/fetcher.ts`**
- **Purpose**: HTTP client for quick-edit API
- **Function**: `fetchEditedCode(payload, signal)`
- **Endpoint**: POST `/api/quick-edit`
- **Timeout**: 30 seconds
- **Error Handling**: Toast message on failure
- **Special**: AbortSignal for cancellation

**`src/features/editor/extensions/suggestion/fetcher.ts`**
- **Purpose**: HTTP client for suggestion API
- **Function**: `fetchSuggestion(payload, signal)`
- **Endpoint**: POST `/api/suggestion`
- **Timeout**: 10 seconds
- **Error Handling**: Silent on AbortError, toast on network error
- **Special**: AbortSignal for cancellation

---

## 🎮 User Interactions

### Suggestion Feature

```
Trigger: Type code + pause 300ms
↓
Display: Ghost text at cursor (faded)
↓
Accept: Press Tab
  or Dismiss: Press Escape
  or Ignore: Keep typing
↓
Result: Suggestion disappears or becomes real text
```

### Quick Edit Feature

```
Trigger: Select text + click "Quick Edit" or press ⌘K
↓
Display: Form with input field
↓
Input: Type instruction (e.g., "make this async")
↓
Submit: Click Submit button or press Enter
↓
Processing: Button shows "Editing..."
↓
Result: Selected code replaced with edited version
```

---

## 🔄 State Management

### StateFields (Data Containers)

| Field | File | Purpose | Initial Value | Updates |
|-------|------|---------|---|---|
| `suggestionState` | suggestion/index.ts | Current suggestion | null | Via `setSuggestionEffect` |
| `quickEditState` | quick-edit/index.ts | Is form open? | false | Via `showQuickEditEffect` |
| `quickEditTooltipField` | quick-edit/index.ts | Form UI | empty array | When state changes |
| `selectionTooltipField` | selection-tooltip.ts | Toolbar UI | empty array | On selection |

### StateEffects (Messages)

| Effect | File | Purpose | Value |
|--------|------|---------|-------|
| `setSuggestionEffect` | suggestion/index.ts | Update suggestion | string \| null |
| `showQuickEditEffect` | quick-edit/index.ts | Toggle form | boolean |

---

## 🌐 Network Calls

### Suggestion API Call

```typescript
POST /api/suggestion

REQUEST:
{
  fileName: "App.tsx",
  code: "(entire file)",
  currentLine: "const x = ",
  previousLines: "import React from 'react';",
  textBeforeCursor: "const x = ",
  textAfterCursor: "",
  nextLines: "console.log(x);",
  lineNumber: 5
}

RESPONSE:
{
  suggestion: "123"  // or empty string ""
}

TIMEOUT: 10 seconds
```

### Quick Edit API Call

```typescript
POST /api/quick-edit

REQUEST:
{
  selectedCode: "function foo() { return fetch('/api'); }",
  fullCode: "(entire file)",
  instruction: "make this async"
}

RESPONSE:
{
  editedCode: "async function foo() { try { await fetch... } catch(e) {...} }"
}

TIMEOUT: 30 seconds
```

---

## ⚙️ How Components Work

### Suggestion Rendering Pipeline

```
User Keystroke
    ↓
Debounce Plugin (300ms timer)
    ↓
generatePayload() [extract context]
    ↓
fetchSuggestion() [HTTP POST]
    ↓
setSuggestionEffect.of(suggestion)
    ↓
suggestionState updated
    ↓
renderPlugin detects state change
    ↓
build() method creates Decoration
    ↓
SuggestionWidget creates DOM
    ↓
User sees ghost text
```

### Quick Edit Flow

```
User Selects Text
    ↓
selectionTooltip detects selection
    ↓
Show "Quick Edit" button
    ↓
User Clicks Button
    ↓
showQuickEditEffect.of(true)
    ↓
quickEditState = true
    ↓
quickEditTooltipField creates form
    ↓
User Types Instruction
    ↓
User Clicks Submit
    ↓
fetchEditedCode() [HTTP POST]
    ↓
editorView.dispatch() [replace selection]
    ↓
showQuickEditEffect.of(false) [close form]
    ↓
Form hidden, code replaced
```

---

## 📊 Key Numbers to Remember

| Item | Value |
|------|-------|
| Debounce delay | 300ms |
| Suggestion timeout | 10 seconds |
| Quick-edit timeout | 30 seconds |
| Previous lines to fetch | 5 |
| Next lines to fetch | 5 |
| Ghost text opacity | 0.4 (40% transparent) |

---

## 🛠️ Technologies Used

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Editor | CodeMirror 6 | Code editing with plugins |
| Frontend HTTP | ky | Lightweight HTTP client |
| State Validation | Zod | Runtime type checking |
| Backend | Node.js/Next.js | Server for API routes |
| AI | Claude 3.5 Sonnet | Language model |
| URL Scraping | Firecrawl | Web content extraction |
| Auth | Clerk | User authentication |
| UI Feedback | Sonner | Toast notifications |

---

## 🎓 Code Patterns Used

### Pattern 1: StateField + StateEffect

```typescript
// Define effect (message type)
const myEffect = StateEffect.define<string>();

// Define field (container)
const myState = StateField.define<string | null>({
  create() { return null; },
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(myEffect)) {
        return effect.value;  // Update!
      }
    }
    return value;
  }
});

// Send update
view.dispatch({ effects: myEffect.of("new value") });
```

### Pattern 2: ViewPlugin

```typescript
const myPlugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      // Initialize
    }
    update(update) {
      // React to changes
    }
    destroy() {
      // Cleanup
    }
  }
);
```

### Pattern 3: Decoration

```typescript
const decoration = Decoration.widget({
  widget: new MyWidget(data),
  side: 1  // 1 = after cursor, -1 = before cursor
}).range(position);

Decoration.set([decoration]);  // Create set
```

### Pattern 4: Abort Signal

```typescript
const signal = new AbortController().signal;

// Cancel anywhere
abortController.abort();

// Handled in fetch
try {
  await ky.post(url, { signal });
} catch(e) {
  if (e.name === "AbortError") {
    // User cancelled
  }
}
```

---

## 🧪 Testing Scenarios

### Test 1: Suggestion Works

```
1. Type: "const x = "
2. Wait 300ms (pause)
3. See faded suggestion appear
✓ Works if suggestion shows within ~1 second
```

### Test 2: Suggestion Cancels

```
1. Type: "const x = "
2. Wait 100ms
3. Type: " test"
4. Should NOT make 2 API calls (debounce should reset)
✓ Works if only 1 API call made
```

### Test 3: Quick Edit Works

```
1. Select code: "function foo() {}"
2. Click "Quick Edit" button
3. Type: "make this async"
4. Click Submit
5. Code should change within ~5 seconds
✓ Works if code is transformed
```

### Test 4: Quick Edit Cancels

```
1. Select code
2. Click "Quick Edit"
3. Type instruction
4. Click Submit
5. Immediately click Cancel
6. Should abort request
✓ Works if Cancel button closes form quickly
```

---

## 🐛 Troubleshooting

| Problem | Cause | Solution |
|---------|-------|----------|
| Suggestion not showing | Debounce timer hasn't passed | Wait 300ms after typing |
| Suggestion shows wrong text | API returned empty string | Line already complete or code already below |
| Form not appearing | Selection is empty | Select text first |
| Form closes immediately | Selection became empty | Keep selection until form appears |
| API timeout | Network slow | Check internet connection |
| "Failed to fetch" toast | API error | Check server logs |

---

## 📖 Related Files to Study

- CodeMirror Docs: https://codemirror.net/docs/
- Zod Validation: https://zod.dev/
- Next.js API Routes: https://nextjs.org/docs/api-routes
- Clerk Auth: https://clerk.com/docs
- Claude API: https://claude.ai/docs

---

## 🚀 Quick Start

### To Run This Project:

```bash
# 1. Install dependencies
npm install

# 2. Set up environment variables
# Add Claude API key and Clerk credentials

# 3. Start development server
npm run dev

# 4. Open in browser
# http://localhost:3000

# 5. Try the features:
# - Type code and pause 300ms for suggestion
# - Select code and press ⌘K for quick edit
```

### To Understand the Code:

1. Start with `selection-tooltip.ts` (simplest)
2. Read `quick-edit/index.ts` (medium)
3. Study `suggestion/index.ts` (complex)
4. Review API routes
5. Read the three learning guides

---

## ✅ Everything Fixed and Documented

- ✅ `suggestion/index.ts` - Fixed and fully commented
- ✅ `quick-edit/index.ts` - Fixed and fully commented
- ✅ All 5 other files - Explained in detail
- ✅ `ARCHITECTURE_EXPLANATION.md` - Complete system overview
- ✅ `COMPLETE_LEARNING_GUIDE.md` - Deep dive learning
- ✅ `CLOCK_OF_CODE.md` - Visual timing diagrams
- ✅ `SUMMARY.md` - What you've learned
- ✅ `QUICK_REFERENCE.md` - This file!

**You now have everything you need to understand and modify this AI code editor system!**
