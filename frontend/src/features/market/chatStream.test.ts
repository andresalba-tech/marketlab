import { describe, expect, it } from "vitest";
import {
  applyChatStreamEvent,
  upsertChatMessage,
  type ChatStreamState,
} from "./chatStream";
import type { ChatMessage, ChatStreamEvent } from "./chatTypes";

function initialState(): ChatStreamState {
  return {
    messages: [],
    lastSequence: 0,
    runningTools: [],
  };
}

const finalMessage: ChatMessage = {
  id: "message-1",
  role: "assistant",
  status: "completed",
  blocks: [
    {
      id: "message-1-text",
      type: "markdown",
      text: "Hola MarketLab.",
    },
  ],
  toolTraces: [],
};

describe("chatStream", () => {
  it("ignora eventos repetidos sin duplicar el texto", () => {
    const event: ChatStreamEvent = {
      sessionId: "session-1",
      messageId: "message-1",
      sequence: 1,
      type: "text.delta",
      payload: {
        blockId: "message-1-stream-0",
        delta: "Hola ",
      },
    };

    const first = applyChatStreamEvent(initialState(), event);
    const repeated = applyChatStreamEvent(first, event);

    expect(repeated).toBe(first);
    expect(repeated.messages[0]?.blocks).toEqual([
      {
        id: "message-1-stream-0",
        type: "markdown",
        text: "Hola ",
      },
    ]);
  });

  it("actualiza un bloque existente por su ID", () => {
    let state = initialState();

    for (const sequence of [1, 2]) {
      state = applyChatStreamEvent(state, {
        sessionId: "session-1",
        messageId: "message-1",
        sequence,
        type: "block.ready",
        payload: {
          block: {
            id: "block-1",
            type: "markdown",
            text: `Versión ${sequence}`,
          },
        },
      });
    }

    expect(state.messages[0]?.blocks).toEqual([
      {
        id: "block-1",
        type: "markdown",
        text: "Versión 2",
      },
    ]);
  });

  it("reemplaza el texto provisional con el mensaje final", () => {
    const streaming = applyChatStreamEvent(initialState(), {
      sessionId: "session-1",
      messageId: "message-1",
      sequence: 1,
      type: "text.delta",
      payload: {
        blockId: "message-1-stream-0",
        delta: "Hola ",
      },
    });

    const completed = applyChatStreamEvent(streaming, {
      sessionId: "session-1",
      messageId: "message-1",
      sequence: 2,
      type: "message.completed",
      payload: { message: finalMessage },
    });

    expect(completed.messages).toEqual([finalMessage]);

    // Si después llega el mismo resultado por POST,
    // debe seguir existiendo una sola respuesta.
    expect(
      upsertChatMessage(completed.messages, finalMessage),
    ).toEqual([finalMessage]);
  });

  it("ignora texto tardío si el POST ya entregó el resultado final", () => {
    const state: ChatStreamState = {
      ...initialState(),
      messages: [finalMessage],
    };

    const next = applyChatStreamEvent(state, {
      sessionId: "session-1",
      messageId: "message-1",
      sequence: 1,
      type: "text.delta",
      payload: {
        blockId: "message-1-stream-0",
        delta: "Texto tardío",
      },
    });

    expect(next.messages).toEqual([finalMessage]);
    expect(next.lastSequence).toBe(1);
  });

  it("quita las herramientas activas cuando el turno se cancela", () => {
    const running = applyChatStreamEvent(initialState(), {
      sessionId: "session-1",
      messageId: "message-1",
      sequence: 1,
      type: "tool.started",
      payload: {
        toolCallId: "call-1",
        toolName: "runBacktest",
      },
    });

    expect(running.runningTools).toHaveLength(1);

    const cancelledMessage: ChatMessage = {
      id: "message-1",
      role: "assistant",
      status: "error",
      blocks: [
        {
          id: "message-1-error",
          type: "error",
          code: "TURN_CANCELLED",
          message: "El turno fue cancelado.",
        },
      ],
      toolTraces: [],
    };

    const cancelled = applyChatStreamEvent(running, {
      sessionId: "session-1",
      messageId: "message-1",
      sequence: 2,
      type: "message.failed",
      payload: {
        message: cancelledMessage,
        code: "TURN_CANCELLED",
        cancelled: true,
      },
    });

    expect(cancelled.runningTools).toEqual([]);
    expect(cancelled.messages).toEqual([cancelledMessage]);
  });
});