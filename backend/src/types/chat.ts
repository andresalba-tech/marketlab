export type AgentBlock =
  | {
      type: "markdown";
      text: string;
    }
  | {
      type: "table";
      title: string;
      columns: string[];
      rows: (string | number | boolean | null)[][];
    }
  | {
      type: "file";
      reportId: string;
      filename: string;
      downloadUrl: string;
      mimeType: string;
    }
  | {
      type: "error";
      code: string;
      message: string;
    };

export type ToolTrace = {
  toolName: string;
  args: Record<string, unknown>;
  ok: boolean;
  durationMs: number;
  error?: {
    code: string;
    message: string;
  };
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  blocks: AgentBlock[];
  status: "pending" | "completed" | "error";
  toolTraces: ToolTrace[];
};

export type ToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type LlmToolCall = {
  id: string;
  name: string;
  arguments: unknown;
};

export type ToolResult =
  | {
      ok: true;
      data: unknown;
    }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
      };
    };

export type LlmMessage =
  | {
      role: "user";
      text: string;
    }
  | {
      role: "assistant";
      text: string;
      toolCalls: LlmToolCall[];
      providerState?: unknown;
    }
  | {
      role: "tool";
      toolCallId: string;
      toolName: string;
      result: ToolResult;
    };

export type LlmCompletionRequest = {
  systemPrompt: string;
  messages: LlmMessage[];
  tools: ToolDefinition[];
  signal: AbortSignal;
};

export type LlmCompletion = {
  text: string;
  toolCalls: LlmToolCall[];
  providerState?: unknown;
};

export interface LlmClient {
  complete(
    request: LlmCompletionRequest,
  ): Promise<LlmCompletion>;
}