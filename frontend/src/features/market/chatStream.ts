import type {
  ChatMessage,
  ChatStreamEvent,
} from "./chatTypes";

export type RunningTool = {
  messageId: string;
  toolCallId: string;
  toolName: string;
};

export type ChatStreamState = {
  messages: ChatMessage[];
  lastSequence: number;
  runningTools: RunningTool[];
};

// Se usa tanto para el resultado del POST como para el evento final.
// Reemplaza el mensaje si ya existe, evitando duplicarlo.
export function upsertChatMessage(
  messages: ChatMessage[],
  incoming: ChatMessage,
): ChatMessage[] {
  const exists = messages.some(
    (message) => message.id === incoming.id,
  );

  return exists
    ? messages.map((message) =>
        message.id === incoming.id ? incoming : message,
      )
    : [...messages, incoming];
}

export function applyChatStreamEvent(
  state: ChatStreamState,
  event: ChatStreamEvent,
): ChatStreamState {
  // Una reconexión puede repetir eventos ya recibidos.
  if (event.sequence <= state.lastSequence) {
    return state;
  }

  const next: ChatStreamState = {
    ...state,
    lastSequence: event.sequence,
  };

  if (
    event.type === "message.completed" ||
    event.type === "message.failed"
  ) {
    return {
      ...next,
      // El mensaje final reemplaza todos sus bloques provisionales.
      messages: upsertChatMessage(
        state.messages,
        event.payload.message,
      ),
      runningTools: state.runningTools.filter(
        (tool) => tool.messageId !== event.messageId,
      ),
    };
  }

  const existing = state.messages.find(
    (message) => message.id === event.messageId,
  );

  // El POST puede entregar el resultado final antes de que
  // procesemos los eventos SSE que estaban en tránsito.
  if (existing && existing.status !== "pending") {
    return next;
  }

  const message: ChatMessage = existing ?? {
    id: event.messageId,
    role: "assistant",
    status: "pending",
    blocks: [],
    toolTraces: [],
  };

  let updatedMessage = message;
  let runningTools = state.runningTools;

  switch (event.type) {
    case "message.started":
      break;

    case "text.delta": {
      const { blockId, delta } = event.payload;
      const existingBlock = message.blocks.find(
        (block) => block.id === blockId,
      );

      updatedMessage = {
        ...message,
        blocks: existingBlock
          ? message.blocks.map((block) =>
              block.id === blockId && block.type === "markdown"
                ? { ...block, text: block.text + delta }
                : block,
            )
          : [
              ...message.blocks,
              {
                id: blockId,
                type: "markdown",
                text: delta,
              },
            ],
      };
      break;
    }

    case "block.ready": {
      const incoming = event.payload.block;

      updatedMessage = {
        ...message,
        blocks: message.blocks.some(
          (block) => block.id === incoming.id,
        )
          ? message.blocks.map((block) =>
              block.id === incoming.id ? incoming : block,
            )
          : [...message.blocks, incoming],
      };
      break;
    }

    case "tool.started":
      runningTools = [
        ...runningTools.filter(
          (tool) =>
            !(
              tool.messageId === event.messageId &&
              tool.toolCallId === event.payload.toolCallId
            ),
        ),
        {
          messageId: event.messageId,
          toolCallId: event.payload.toolCallId,
          toolName: event.payload.toolName,
        },
      ];
      break;

    case "tool.completed":
      runningTools = runningTools.filter(
        (tool) =>
          !(
            tool.messageId === event.messageId &&
            tool.toolCallId === event.payload.toolCallId
          ),
      );

      updatedMessage = {
        ...message,
        toolTraces: [
          ...message.toolTraces,
          event.payload.trace,
        ],
      };
      break;
  }

  return {
    ...next,
    messages: upsertChatMessage(state.messages, updatedMessage),
    runningTools,
  };
}