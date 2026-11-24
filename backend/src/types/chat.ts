export type AgentBlock = { id: string } & (
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
    }
  | {
      type: "chart";
      title: string;
      series: {
        name: string;
        points: {
          time: string;
          value: number | null;
        }[];
      }[];
    }
  | {
      type: "svg";
      title: string;
      content: string;
    }
);

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
  onTextDelta?: (delta: string) => void;
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

export type ChatStreamEvent = {
  sessionId: string;
  messageId: string;
  sequence: number;
} & (
  | {
      type: "message.started";
      payload: { role: "assistant" };
    }
  | {
      type: "text.delta";
      payload: {
        blockId: string;
        delta: string;
      };
    }
  | {
      type: "tool.started";
      payload: {
        toolCallId: string;
        toolName: string;
      };
    }
  | {
      type: "tool.completed";
      payload: {
        toolCallId: string;
        trace: ToolTrace;
      };
    }
  | {
      type: "block.ready";
      payload: { block: AgentBlock };
    }
  | {
      type: "message.completed";
      payload: { message: ChatMessage };
    }
  | {
      type: "message.failed";
      payload: {
        message: ChatMessage;
        code: string;
        cancelled: boolean;
      };
    }
);

// Conserva cada combinación válida de type y payload,
// pero deja sessionId y sequence a cargo de la sesión.
export type AgentTurnEvent =
  ChatStreamEvent extends infer Event
    ? Event extends ChatStreamEvent
      ? Omit<Event, "sessionId" | "sequence">
      : never
    : never;