# ⏰ "Clock of Code" - Visual System Breakdown

## The Two Main Features (Two Separate Clocks)

```
═══════════════════════════════════════════════════════════════════════════════
                    SUGGESTION FEATURE (Auto-Completion)
═══════════════════════════════════════════════════════════════════════════════

            User Types              Debounce       Fetch          Render
               ↓                      ↓             ↓              ↓
          keystroke               300ms timer   API call      Draw on screen
            ↙     ↘
         doc      cursor                         ↓
         change   moved                      ┌────────┐
           ↓        ↓                         │ Claude │
           └────────┴──────────────────→     └────────┘
                                              ↓
                                          Response:
                                          "suggestion"
                                              ↓
                                         [Decoration]
                                              ↓
                                         Ghost text


STEP-BY-STEP EXECUTION:

1️⃣ DETECTION
   ┌─────────────────────────────────────────────┐
   │ const sum = (a, b)                          │
   │ User pauses here after typing = │           │
   └─────────────────────────────────────────────┘
   
   → debounceTimer starts (300ms countdown)

2️⃣ WAIT (300ms)
   ⏱️  300... 299... 298... ... 1... 0
   
   → If user types again during wait, reset timer!
   → If user types: "const sum = (a, b) => a" 
   → Timer resets! Countdown starts over

3️⃣ EXTRACT CONTEXT
   ┌──────────────────────────────────────────────┐
   │ const sum = (a, b) => {                      │
   │   return a +                                 │ ← cursor here
   │ }                                            │
   └──────────────────────────────────────────────┘
   
   Payload generated:
   {
     fileName: "math.ts",
     code: "(full file)",
     currentLine: "  return a +",
     lineNumber: 2,
     previousLines: "const sum = (a, b) => {",
     textBeforeCursor: "  return a +",
     textAfterCursor: "",
     nextLines: "}",
   }

4️⃣ SEND TO API
   ┌─────────────────────────────┐
   │ POST /api/suggestion        │
   │ Content-Type: application/  │
   │ json                        │
   │                             │
   │ { payload }                 │
   └─────────────────────────────┘
        ↓ HTTP request
   ┌─────────────────────────────┐
   │ Backend Processing          │
   │ Claude AI models query      │
   └─────────────────────────────┘
        ↓ ~500ms wait
   ┌─────────────────────────────┐
   │ { suggestion: "b" }         │
   └─────────────────────────────┘

5️⃣ UPDATE STATE
   setSuggestionEffect.of("b") dispatched
   
   suggestionState updates:
   before: null
   after:  "b"

6️⃣ RENDER
   renderPlugin.update() called
   
   Reads: suggestionState = "b"
   Creates: SuggestionWidget("b")
   Creates: DecorationSet with widget at cursor
   
   Returns new decorations

7️⃣ DISPLAY
   ┌──────────────────────────────────────────────┐
   │ const sum = (a, b) => {                      │
   │   return a +b                                │
   │         faded ↑                              │
   │         ghost text                           │
   │ }                                            │
   └──────────────────────────────────────────────┘

8️⃣ USER ACTION
   Option A: Press Tab
            ↓
      Select: suggestionState = "b"
      Insert: suggestion at cursor
      Clear: suggestionState = null
      Result: "return a +b" (solid text)
   
   Option B: Press Escape
            ↓
      Clear: suggestionState = null
      Result: suggestion disappears
   
   Option C: Keep Typing
            ↓
      User types: "b" manually
      Debounce restarts
      New suggestion fetched for "return a +b"


═══════════════════════════════════════════════════════════════════════════════
                    QUICK EDIT FEATURE (Code Transformation)
═══════════════════════════════════════════════════════════════════════════════

       User Selects        Clicks          Types        Submits      Replace
           ↓              "Edit"        Instruction      Form          Code
       CODE BLOCK     Button/Mod-K    "make async"  "Editing..."      ✅
         ↙   ↘
     from   to


STEP-BY-STEP EXECUTION:

1️⃣ SELECTION
   ┌──────────────────────────────────────────────┐
   │ function getData() {                         │
   │   return fetch('/api/data');                 │
   │ }                                            │
   │                                              │
   └──────────────────────────────────────────────┘
   
   User drags to select above code
   
   → selectionTooltip detects selection
   → creates tooltip below

2️⃣ TOOLTIP APPEARS
   ┌──────────────────────────────────────────────┐
   │ function getData() {                         │
   │   return fetch('/api/data');                 │
   │ }                                            │
   │                                              │
   │ ┌─────────────────────────────────────────┐  │
   │ │ [Add to Chat] [Quick Edit ⌘K]           │  │
   │ └─────────────────────────────────────────┘  │
   └──────────────────────────────────────────────┘

3️⃣ USER CLICKS "Quick Edit"
   Keyboard event: key = "Mod-k" (or mouse click)
   
   → showQuickEditEffect.of(true) dispatched
   → quickEditState updates: false → true

4️⃣ FORM APPEARS
   quickEditTooltipField reads state:
   - quickEditState = true
   - selection = not empty
   
   → createQuickEditToolTip() creates form
   
   ┌────────────────────────────────────────────┐
   │ Edit selected code                         │
   │                                            │
   │ ┌──────────────────────────────────────┐  │
   │ │ make this async                    │  │  ← input focused
   │ └──────────────────────────────────────┘  │
   │                                            │
   │ [Cancel]  [Submit]                        │
   └────────────────────────────────────────────┘

5️⃣ USER TYPES INSTRUCTION
   Input value: "make this async"
   (If it had URL: "make this async per https://...", system scrapes URL!)

6️⃣ USER CLICKS SUBMIT
   Form.onsubmit handler:
   
   ✓ Get instruction from input
   ✓ Get selectedCode from editor
   ✓ Get fullCode from editor
   ✓ Show button: "Editing..."
   ✓ Create AbortController
   ✓ Call fetchEditedCode()

7️⃣ SEND TO API
   ┌─────────────────────────────┐
   │ POST /api/quick-edit        │
   │                             │
   │ {                           │
   │   selectedCode: "function...",     │
   │   fullCode: "(entire file)",       │
   │   instruction: "make this async"   │
   │ }                           │
   └─────────────────────────────┘
        ↓ HTTP request
   ┌──────────────────────────────────┐
   │ Backend Processing               │
   │                                  │
   │ Step 1: Check auth ✓            │
   │ Step 2: Validate inputs ✓       │
   │ Step 3: Extract URLs:           │
   │         None in this case       │
   │ Step 4: Build prompt with:      │
   │         - selectedCode          │
   │         - fullCode context      │
   │         - documentation (none)  │
   │         - instruction           │
   │ Step 5: Call Claude AI          │
   │         "Transform to async"    │
   │                                  │
   └──────────────────────────────────┘
        ↓ ~2-5 seconds wait
   ┌──────────────────────────────────┐
   │ {                                │
   │   editedCode:                    │
   │   "async function getData() {   │
   │      try {                       │
   │        const resp = await        │
   │          fetch('/api/data');    │
   │        return resp;              │
   │      } catch(e) {               │
   │        console.error(e);        │
   │      }                           │
   │    }"                            │
   │ }                                │
   └──────────────────────────────────┘

8️⃣ RESPONSE RECEIVED
   fetchEditedCode returns edited code
   
   ✓ Button text: "Editing..." → "Submit"
   ✓ editorView.dispatch() called with:
     - changes: { from, to, insert: editedCode }
     - selection: { anchor: new end position }
     - effects: showQuickEditEffect.of(false)

9️⃣ CODE REPLACED
   ┌──────────────────────────────────────────────┐
   │ async function getData() {                   │
   │   try {                                      │
   │     const resp = await fetch('/api/data');   │
   │     return resp;                             │
   │   } catch(e) {                               │
   │     console.error(e);                        │
   │   }                                          │
   │ }                                            │
   │                                              │
   │ ← Replaced! Form hidden!                    │
   └──────────────────────────────────────────────┘

🔟 FORM CLOSES
   showQuickEditEffect.of(false)
   
   → quickEditState = false
   → quickEditTooltipField creates empty array
   → Form tooltip disappears


═══════════════════════════════════════════════════════════════════════════════
                        WHEN THINGS GO WRONG
═══════════════════════════════════════════════════════════════════════════════

SUGGESTION - USER CANCELS:
   User typing...
   Suggestion fetching...
   User types again before response arrives
   
   → Debounce timer resets
   → currentAbortController.abort() called
   → Network request cancelled
   → No wasted computation

SUGGESTION - NETWORK TIMEOUT:
   User typing...
   Suggestion starts fetching...
   10 seconds pass with no response
   
   → timeout: 10_000 triggers
   → Request cancelled
   → fetchSuggestion() catches error
   → Returns null (no suggestion shown)
   → No toast error (network glitch happens)

QUICK EDIT - NETWORK ERROR:
   User submits form
   Network fails
   
   → fetchEditedCode() catches error
   → toast.error("Failed to fetch AI quick edit")
   → Button disabled = false
   → Button text = "Submit"
   → Form stays visible
   → User can retry

QUICK EDIT - USER CANCELS:
   User submits form
   "Editing..." appears
   User panics and clicks Cancel
   
   → cancelButton.onclick() fires
   → currentAbortController.abort()
   → Network request cancelled
   → showQuickEditEffect.of(false)
   → Form closes
   → Code not replaced


═══════════════════════════════════════════════════════════════════════════════
                        KEY TIMING NUMBERS
═══════════════════════════════════════════════════════════════════════════════

SUGGESTION:
  300ms  ← Debounce wait (user must stop typing for this long)
  10s    ← Total timeout (if API doesn't respond in 10 seconds, cancel)
  ~500ms ← Typical Claude API response time
  Total: 300ms + 500ms = ~800ms before you see suggestion

QUICK EDIT:
  30s    ← Total timeout (longer because may scrape URLs)
  ~2-5s  ← Typical Claude API response time (more complex task)
  Total: 2-5 seconds before you see edited code


═══════════════════════════════════════════════════════════════════════════════
                        DATA FLOW DIAGRAM
═══════════════════════════════════════════════════════════════════════════════

                        ┌─────────────────────┐
                        │   CodeMirror View   │
                        │   (the editor)      │
                        └──────────┬──────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    │              │              │
                    ↓              ↓              ↓
            Selection    Keystroke   Cursor Move
            Detected      Detected    Detected
                    │              │              │
                    ↓              ↓              ↓
            ┌─────────────┐ ┌──────────────┐ ┌──────────────┐
            │Selection    │ │ Suggestion   │ │ Cursor       │
            │Tooltip      │ │ Plugin       │ │ Update       │
            │Extension    │ │              │ │              │
            └──────┬──────┘ └──────┬───────┘ └──────┬───────┘
                   │               │                │
                   │               ↓                │
                   │        ┌─────────────┐        │
                   │        │ Debounce    │        │
                   │        │ 300ms timer │        │
                   │        └─────┬───────┘        │
                   │              │                │
                   │              ↓                │
                   │        ┌────────────────┐     │
                   │        │ Generate       │     │
                   │        │ Payload        │     │
                   │        └────────┬───────┘     │
                   │                 │             │
                   ↓                 ↓             │
            ┌──────────────┐  ┌──────────────┐   │
            │ Show Buttons │  │ Fetch API    │   │
            │ "Quick Edit" │  │ (suggestion) │   │
            │ "Add to Chat"│  └──────┬───────┘   │
            └──────┬───────┘         │           │
                   │                 ↓           │
            ┌──────────────────┐ ┌─────────────┐ │
            │ User clicks      │ │ Update      │ │
            │ "Quick Edit"     │ │ Suggestion  │ │
            └──────┬───────────┘ │ State       │ │
                   │             └──────┬──────┘ │
                   ↓                    ↓        │
            ┌──────────────┐  ┌──────────────┐  │
            │ Show Form    │  │ Render       │  │
            │              │  │ Plugin       │  │
            └──────┬───────┘  │ Creates      │  │
                   │          │ Decoration   │  │
                   │          └──────┬───────┘  │
                   ↓                 ↓          │
            ┌──────────────┐  ┌──────────────┐ │
            │ User types   │  │ Display      │ │
            │ instruction  │  │ Ghost text   │ │
            └──────┬───────┘  └──────┬───────┘ │
                   │                 ↓         │
                   │          ┌────────────┐   │
                   │          │ User presses   │
                   │          │ Tab to accept  │
                   │          │ or Escape      │
                   │          └────────┬───────┘
                   │                   │
                   ↓                   ↓
            ┌──────────────┐  ┌──────────────┐
            │ User clicks  │  │ Insert       │
            │ Submit       │  │ Suggestion   │
            └──────┬───────┘  │ as real text │
                   │          └──────┬───────┘
                   ↓                 ↓
            ┌──────────────┐  ┌──────────────┐
            │ Fetch API    │  │ Clear        │
            │ (quick-edit) │  │ Decoration   │
            └──────┬───────┘  └──────────────┘
                   │
                   ↓
            ┌──────────────┐
            │ Replace      │
            │ Selected     │
            │ Code with    │
            │ Edited       │
            │ Version      │
            └──────┬───────┘
                   │
                   ↓
            ┌──────────────┐
            │ Close Form   │
            │ Clear State  │
            └──────────────┘
