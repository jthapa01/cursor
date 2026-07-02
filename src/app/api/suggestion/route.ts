import { generateText } from "ai";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";

const SUGGESTION_PROMPT = `You are a code suggestion assistant.

<context>
<file_name>{fileName}</file_name>
<previous_lines>
{previousLines}
</previous_lines>
<current_line number="{lineNumber}">{currentLine}</current_line>
<before_cursor>{textBeforeCursor}</before_cursor>
<after_cursor>{textAfterCursor}</after_cursor>
<next_lines>
{nextLines}
</next_lines>
<full_code>
{code}
</full_code>
</context>

<instructions>
Follow these steps IN ORDER:

1. First, look at next_lines. If next_lines contains ANY code, check if it continues from where the cursor is. If it does, return empty string immediately - the code is already written.

2. Check if before_cursor ends with a complete statement (;, }, )). If yes, return empty string.

3. Only if steps 1 and 2 don't apply: suggest what should be typed at the cursor position, using context from full_code.

Your suggestion is inserted immediately after the cursor, so never suggest code that's already in the file.
</instructions>`;

const normalizeSuggestion = (text: string) =>
  text.replace(/^```[a-zA-Z0-9]*\n?/, "").replace(/\n?```$/, "");

const generateSuggestionText = async (
  prompt: string,
): Promise<string | null> => {
  const modelFactories = [] as Array<
    () => ReturnType<typeof anthropic> | ReturnType<typeof google>
  >;

  if (process.env.ANTHROPIC_API_KEY) {
    modelFactories.push(() => anthropic("claude-sonnet-5"));
  }

  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    modelFactories.push(() => google("gemini-1.5-flash"));
  }

  for (const getModel of modelFactories) {
    try {
      const { text } = await generateText({
        model: getModel(),
        prompt,
      });

      return normalizeSuggestion(text);
    } catch (error) {
      console.error("Suggestion model attempt failed:", error);
    }
  }

  return null;
};

export async function POST(request: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const {
      fileName,
      code,
      currentLine,
      previousLines,
      textBeforeCursor,
      textAfterCursor,
      nextLines,
      lineNumber,
    } = await request.json();

    if (!code) {
      return NextResponse.json({ error: "Code is required" }, { status: 400 });
    }

    const prompt = SUGGESTION_PROMPT.replace("{fileName}", fileName)
      .replace("{previousLines}", previousLines || "")
      .replace("{currentLine}", currentLine || "")
      .replace("{textBeforeCursor}", textBeforeCursor || "")
      .replace("{textAfterCursor}", textAfterCursor || "")
      .replace("{nextLines}", nextLines || "")
      .replace("{code}", code || "")
      .replace("{lineNumber}", String(lineNumber || ""));

    const suggestion = await generateSuggestionText(prompt);

    if (suggestion === null) {
      return NextResponse.json({ suggestion: "" });
    }

    return NextResponse.json({ suggestion });
  } catch (error) {
    console.error("Error in suggestion API:", error);
    return NextResponse.json({ suggestion: "" });
  }
}
