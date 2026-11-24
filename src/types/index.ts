export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
}

export interface ChatApiSuccess {
  reply: string;
}

export interface ChatApiError {
  error: string;
}
