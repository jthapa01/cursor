import ky, { HTTPError } from "ky";
import { z } from "zod";
import { toast } from "sonner";

const suggestionRequestSchema = z.object({
  fileName: z.string(),
  code: z.string(),
  currentLine: z.string(),
  previousLines: z.string(),
  textBeforeCursor: z.string(),
  textAfterCursor: z.string(),
  nextLines: z.string(),
  lineNumber: z.number(),
});

const suggestionResponseSchema = z.object({
  suggestion: z.string(),
});

type SuggestionRequest = z.infer<typeof suggestionRequestSchema>;
type SuggestionResponse = z.infer<typeof suggestionResponseSchema>;

export const fetcher = async (
  payload: SuggestionRequest,
  signal: AbortSignal,
): Promise<string | null> => {
  try {
    const validatedPayload = suggestionRequestSchema.parse(payload);

    const response = await ky
      .post("/api/suggestion", {
        json: validatedPayload,
        signal,
        timeout: 20_000,
        retry: 0,
      })
      .json<SuggestionResponse>();

    const validatedResponse = suggestionResponseSchema.parse(response);

    return validatedResponse.suggestion || null;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return null;
    }

    if (error instanceof HTTPError) {
      const status = error.response.status;
      let message = "Failed to fetch AI completion";

      try {
        const body = (await error.response.clone().json()) as {
          error?: string;
        };
        if (body?.error) {
          message = body.error;
        }
      } catch {
        // Ignore JSON parse failures and keep fallback message.
      }

      if (status === 401 || status === 403) {
        toast.error("Sign in required for AI suggestions");
        return null;
      }

      // Suggestions are best-effort; avoid noisy toasts for transient backend issues.
      if (status >= 500) {
        return null;
      }

      toast.error(message);
      return null;
    }

    if (error instanceof z.ZodError) {
      toast.error("Invalid suggestion request/response shape");
      return null;
    }

    if (error instanceof Error && error.name === "TimeoutError") {
      return null;
    }

    // Network and other transient failures should not interrupt typing with toasts.
    return null;
  }
};
