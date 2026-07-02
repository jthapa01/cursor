import ky, { HTTPError } from "ky";
import { z } from "zod";
import { toast } from "sonner";

const editRequestSchema = z.object({
  selectedCode: z.string(),
  fullCode: z.string(),
  instruction: z.string(),
});

const editResponseSchema = z.object({
  editedCode: z.string(),
  noChange: z.boolean().optional(),
});

type EditRequest = z.infer<typeof editRequestSchema>;
type EditResponse = z.infer<typeof editResponseSchema>;

export const fetchEditedCode = async (
  payload: EditRequest,
  signal: AbortSignal,
): Promise<{ editedCode: string; noChange: boolean } | null> => {
  try {
    const validatedPayload = editRequestSchema.parse(payload);

    const response = await ky
      .post("/api/quick-edit", {
        json: validatedPayload,
        signal,
        timeout: 30_000, // 30 seconds timeout
        retry: 0, // Disable retries
      })
      .json<EditResponse>();

    const validatedResponse = editResponseSchema.parse(response);
    return {
      editedCode: validatedResponse.editedCode,
      noChange: validatedResponse.noChange ?? false,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return null;
    }

    if (error instanceof HTTPError) {
      const status = error.response.status;
      let message = "Failed to fetch AI quick edit";

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
        toast.error("Sign in required to use Quick Edit");
        return null;
      }

      toast.error(message);
      return null;
    }

    if (error instanceof z.ZodError) {
      toast.error("Invalid quick edit request/response shape");
      return null;
    }

    toast.error("Failed to fetch AI quick edit");
    return null;
  }
};
