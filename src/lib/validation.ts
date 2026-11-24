import { z } from "zod";

export const MESSAGE_MAX_LENGTH = 4000;
export const SESSION_ID_MAX_LENGTH = 128;

export const chatRequestSchema = z.object({
  message: z
    .string({ error: "message must be a string" })
    .trim()
    .min(1, "message must not be empty")
    .max(MESSAGE_MAX_LENGTH, `message must be at most ${MESSAGE_MAX_LENGTH} characters`),
  sessionId: z
    .string({ error: "sessionId must be a string" })
    .trim()
    .min(1, "sessionId must not be empty")
    .max(
      SESSION_ID_MAX_LENGTH,
      `sessionId must be at most ${SESSION_ID_MAX_LENGTH} characters`,
    )
    .regex(
      /^[A-Za-z0-9._:-]+$/,
      "sessionId may only contain letters, numbers, dot, underscore, colon and hyphen",
    ),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const chatSuccessSchema = z.object({
  reply: z.string().min(1),
});

export type ChatSuccess = z.infer<typeof chatSuccessSchema>;

export const chatErrorSchema = z.object({
  error: z.string(),
});

export type ChatError = z.infer<typeof chatErrorSchema>;

export function parseChatRequest(input: unknown):
  | { success: true; data: ChatRequest }
  | { success: false; error: z.ZodError } {
  const result = chatRequestSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
