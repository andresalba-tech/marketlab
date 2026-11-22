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

