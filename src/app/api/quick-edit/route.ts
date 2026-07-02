import { generateText } from "ai";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { anthropic } from "@ai-sdk/anthropic";
import { firecrawl } from "@/lib/firecrawl";

const URL_REGEX = /https?:\/\/[^\s)>\]]+/g;

const CODE_BLOCK_REGEX = /```(?:[a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g;

const QUICK_EDIT_PROMPT = `You are a code editing assistant. Edit the selected code based on the user's instruction.

<context>
<selected_code>
{selectedCode}
</selected_code>
<full_code_context>
{fullCode}
</full_code_context>
</context>

{documentation}

<instruction>
{instruction}
</instruction>

<instructions>
Return ONLY the edited version of the selected code.
Maintain the same indentation level as the original.
Do not include any explanations or comments unless requested.
Make the smallest correct change that satisfies the instruction.
Do not return the original code unchanged unless the instruction truly cannot be applied.
Prefer a concrete rewritten result over a no-op.
If the documentation contains code examples relevant to the instruction, treat those examples as authoritative and follow their pattern when rewriting the selected code.
If a code example from the documentation directly applies, adapt that example to the selected code instead of inventing a new approach.
</instructions>`;

const normalizeEditedCode = (text: string) =>
  text
    .replace(/^```[a-zA-Z0-9]*\n?/, "")
    .replace(/\n?```$/, "")
    .trim();

const extractCodeExamples = (markdown: string) => {
  const examples = Array.from(markdown.matchAll(CODE_BLOCK_REGEX))
    .map((match) => match[1].trim())
    .filter(Boolean)
    .slice(0, 3);

  return examples;
};

type GenerateResult = {
  code: string | null;
  error: string | null;
};

const generateEditedCode = async (prompt: string): Promise<GenerateResult> => {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { code: null, error: "ANTHROPIC_API_KEY is not configured" };
  }

  try {
    const { text } = await generateText({
      model: anthropic("claude-sonnet-5"),
      prompt,
    });

    return { code: normalizeEditedCode(text), error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Quick edit model call failed:", error);
    return { code: null, error: message };
  }
};

const generateEditedCodeWithRetry = async (
  prompt: string,
  selectedCode: string,
  instruction: string,
  hasDocumentation: boolean,
): Promise<GenerateResult> => {
  const trimmedSelected = selectedCode.trim();

  const firstAttempt = await generateEditedCode(prompt);
  if (firstAttempt.code && firstAttempt.code.trim() !== trimmedSelected) {
    return firstAttempt;
  }
  // If the model errored, stop retrying and report the error.
  if (firstAttempt.error) {
    return firstAttempt;
  }

  const retryPrompt = `${prompt}\n\nThe previous result was unchanged or too close to the original code. Produce a real rewrite that applies the instruction: ${instruction}`;
  const retryAttempt = await generateEditedCode(retryPrompt);
  if (retryAttempt.code && retryAttempt.code.trim() !== trimmedSelected) {
    return retryAttempt;
  }

  // Final, forceful attempt: if documentation was provided, demand that its
  // code example is applied to the selected code.
  if (hasDocumentation) {
    const forcedPrompt = `${prompt}\n\nIMPORTANT: You returned the original code twice. The <documentation_code_examples> contain the exact pattern to use. You MUST transform the selected code by applying that documentation code example. Returning the original code unchanged is NOT acceptable. Output ONLY the rewritten code.`;
    const forcedAttempt = await generateEditedCode(forcedPrompt);
    if (forcedAttempt.code && forcedAttempt.code.trim() !== trimmedSelected) {
      return forcedAttempt;
    }
  }

  return firstAttempt;
};

export async function POST(req: Request) {
  let selectedCodeFallback = "";

  try {
    const { userId } = await auth();
    const { selectedCode, fullCode, instruction } = await req.json();

    if (typeof selectedCode === "string") {
      selectedCodeFallback = selectedCode;
    }

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!selectedCode) {
      return NextResponse.json(
        { error: "Selected code is required" },
        { status: 400 },
      );
    }

    if (!instruction) {
      return NextResponse.json(
        { error: "Instruction is required" },
        { status: 400 },
      );
    }

    const urls: string[] = instruction.match(URL_REGEX) || [];
    let documentation = "";
    let documentationCodeExamples = "";

    if (urls.length > 0) {
      const crawlResults = await Promise.all(
        urls.map(async (url) => {
          try {
            const result = await firecrawl.scrape(url, {
              formats: ["markdown"],
            });
            if (result.markdown) {
              return `<doc url="${url}">\n${result.markdown}\n</doc>`;
            }
            return null;
          } catch (error) {
            console.error(`Error scraping URL ${url}:`, error);
            return null;
          }
        }),
      );

      const validResults = crawlResults.filter(Boolean) as string[];

      if (validResults.length > 0) {
        documentation = `<documentation>\n${validResults.join("\n\n")}\n</documentation>`;
        const codeExamples = validResults
          .flatMap((result) => extractCodeExamples(result))
          .slice(0, 5);

        if (codeExamples.length > 0) {
          documentationCodeExamples = `<documentation_code_examples>\n${codeExamples
            .map((example) => `<code_example>\n${example}\n</code_example>`)
            .join("\n\n")}\n</documentation_code_examples>`;
        }
      }
    }

    const hasDocumentation = documentation.length > 0;

    const prompt = QUICK_EDIT_PROMPT.replace("{selectedCode}", selectedCode)
      .replace("{fullCode}", fullCode || "")
      .replace("{instruction}", instruction)
      .replace(
        "{documentation}",
        [documentation, documentationCodeExamples].filter(Boolean).join("\n\n"),
      );

    const result = await generateEditedCodeWithRetry(
      prompt,
      selectedCode,
      instruction,
      hasDocumentation,
    );

    if (!result.code) {
      return NextResponse.json({ editedCode: selectedCode, noChange: true });
    }

    const noChange = result.code.trim() === selectedCode.trim();

    return NextResponse.json({ editedCode: result.code, noChange });
  } catch (error) {
    console.error("Error in quick edit API:", error);
    if (selectedCodeFallback) {
      return NextResponse.json({ editedCode: selectedCodeFallback });
    }
    return NextResponse.json({ editedCode: "" });
  }
}
