import { Router, json } from "express";
import type { Response } from "express";
import { randomUUID } from "node:crypto";
import type {
  AgentTurnEvent,
  ChatMessage,
  ChatStreamEvent,
  LlmClient,
  LlmMessage,
} from "../types/chat.js";
import { runAgentTurn } from "../agent/runAgentTurn.js";

const MAX_EVENTS = 500;

type ChatSession = {
  messages: ChatMessage[];
  history: LlmMessage[];
  busy: boolean;
  controller: AbortController | null;
  sequence: number;
  events: ChatStreamEvent[];
  subscribers: Set<Response>;
};

function validSessionId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{1,100}$/.test(id);
}

function writeEvent(
  response: Response,
  event: ChatStreamEvent,
): void {
  response.write(
    `id: ${event.sequence}\n` +
    `data: ${JSON.stringify(event)}\n\n`,
  );
}

export function createChatRouter(llmClient: LlmClient) {
  const router = Router();
  const sessions = new Map<string, ChatSession>();

  function getOrCreateSession(id: string): ChatSession {
    const existing = sessions.get(id);

    if (existing) return existing;

    const session: ChatSession = {
      messages: [],
      history: [],
      busy: false,
      controller: null,
      sequence: 0,
      events: [],
      subscribers: new Set(),
    };

    sessions.set(id, session);
    return session;
  }

  function publish(
    sessionId: string,
    session: ChatSession,
    event: AgentTurnEvent,
  ): void {
    const streamEvent: ChatStreamEvent = {
      ...event,
      sessionId,
      sequence: ++session.sequence,
    };

    session.events.push(streamEvent);

    if (session.events.length > MAX_EVENTS) {
      session.events.splice(0, session.events.length - MAX_EVENTS);
    }

    for (const subscriber of session.subscribers) {
      if (subscriber.destroyed || subscriber.writableEnded) {
        session.subscribers.delete(subscriber);
        continue;
      }

      try {
        // Cerramos conexiones demasiado lentas para limitar su cola.
        // El cliente podrá reconectar usando el último ID recibido.
        if (subscriber.writableLength > 1_000_000) {
          session.subscribers.delete(subscriber);
          subscriber.destroy();
          continue;
        }

        writeEvent(subscriber, streamEvent);
      } catch {
        session.subscribers.delete(subscriber);
        subscriber.destroy();
      }
    }
  }

  router.get("/sessions/:id/events", (req, res) => {
    const sessionId = req.params.id;

    if (!validSessionId(sessionId)) {
      res.status(400).json({
        error: "ID de sesión inválido.",
      });
      return;
    }

    const rawLastId = req.get("Last-Event-ID");
    let lastSequence = 0;

    if (rawLastId !== undefined) {
      if (!/^\d+$/.test(rawLastId)) {
        res.status(400).json({
          error: "Last-Event-ID debe ser un entero no negativo.",
        });
        return;
      }

      lastSequence = Number(rawLastId);

      if (!Number.isSafeInteger(lastSequence)) {
        res.status(400).json({
          error: "Last-Event-ID está fuera del rango permitido.",
        });
        return;
      }
    }

    const session = getOrCreateSession(sessionId);

    if (lastSequence > session.sequence) {
      res.status(409).json({
        error: "Last-Event-ID es posterior al último evento disponible.",
        code: "INVALID_EVENT_CURSOR",
      });
      return;
    }

    const firstAvailable = session.events[0]?.sequence;

    if (
      firstAvailable !== undefined &&
      lastSequence < firstAvailable - 1
    ) {
      // No fingimos una recuperación completa si faltan eventos.
      res.status(409).json({
        error: "Los eventos solicitados ya no están en el buffer.",
        code: "EVENT_HISTORY_EXPIRED",
      });
      return;
    }

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    // EventSource esperará dos segundos antes de reconectar.
    res.write("retry: 2000\n\n");

    // Recuperamos únicamente eventos posteriores al último recibido.
    // No hay awaits entre la recuperación y la suscripción.
    for (const event of session.events) {
      if (event.sequence > lastSequence) {
        writeEvent(res, event);
      }
    }

    session.subscribers.add(res);

    const heartbeat = setInterval(() => {
      if (!res.destroyed && !res.writableEnded) {
        res.write(": heartbeat\n\n");
      }
    }, 15000);

    res.on("close", () => {
      clearInterval(heartbeat);
      session.subscribers.delete(res);
    });

    // Cerrar el stream no cancela el turno: permite reconectar.
    // La cancelación se solicita mediante /cancel.
  });

  router.post(
    "/sessions/:id/messages",
    json({ limit: "32kb" }),
    async (req, res) => {
      const sessionId = req.params.id;
      const body: unknown = req.body;

      if (!validSessionId(sessionId)) {
        res.status(400).json({
          error: "ID de sesión inválido.",
        });
        return;
      }

      if (
        typeof body !== "object" ||
        body === null ||
        Array.isArray(body) ||
        Object.keys(body).some((key) => key !== "text") ||
        !("text" in body) ||
        typeof body.text !== "string" ||
        body.text.trim() === "" ||
        body.text.length > 4000
      ) {
        res.status(400).json({
          error: "Envía únicamente text, con entre 1 y 4000 caracteres.",
        });
        return;
      }

      const session = getOrCreateSession(sessionId);

      if (session.busy) {
        res.status(409).json({
          error: "La sesión ya está procesando un mensaje.",
        });
        return;
      }

      const controller = new AbortController();

      session.busy = true;
      session.controller = controller;

      const text = body.text.trim();

      const userMessage: ChatMessage = {
        id: randomUUID(),
        role: "user",
        blocks: [
          { id: randomUUID(), type: "markdown", text },
        ],
        status: "completed",
        toolTraces: [],
      };

      let activeMessageId: string | undefined;
      let terminalEventSent = false;

      try {
        const turn = await runAgentTurn({
          llmClient,
          history: [
            ...session.history,
            { role: "user", text },
          ],
          llmTimeoutMs: 60000,
          signal: controller.signal,
          onEvent(event) {
            activeMessageId = event.messageId;

            if (
              event.type === "message.completed" ||
              event.type === "message.failed"
            ) {
              terminalEventSent = true;
            }

            publish(sessionId, session, event);
          },
        });

        session.history = turn.history;
        session.messages.push(userMessage, turn.message);

        res.json(turn.message);
      } catch {
        // Evita dejar al cliente SSE esperando si ocurre
        // una excepción inesperada fuera del manejo normal del agente.
        if (activeMessageId && !terminalEventSent) {
          const failedMessage: ChatMessage = {
            id: activeMessageId,
            role: "assistant",
            status: "error",
            blocks: [
              {
                id: `${activeMessageId}-error`,
                type: "error",
                code: "INTERNAL_ERROR",
                message: "No se pudo procesar el mensaje.",
              },
            ],
            toolTraces: [],
          };

          publish(sessionId, session, {
            messageId: activeMessageId,
            type: "message.failed",
            payload: {
              message: failedMessage,
              code: "INTERNAL_ERROR",
              cancelled: false,
            },
          });
        }

        res.status(500).json({
          error: "No se pudo procesar el mensaje.",
        });
      } finally {
        session.busy = false;
        session.controller = null;
      }
    },
  );

  router.post("/sessions/:id/cancel", (req, res) => {
    const sessionId = req.params.id;

    if (!validSessionId(sessionId)) {
      res.status(400).json({
        error: "ID de sesión inválido.",
      });
      return;
    }

    const session = sessions.get(sessionId);

    if (!session) {
      res.status(404).json({
        error: "Sesión no encontrada.",
      });
      return;
    }

    if (!session.busy || !session.controller) {
      res.json({
        cancellationRequested: false,
      });
      return;
    }

    session.controller.abort();

    res.status(202).json({
      cancellationRequested: true,
    });
  });

  return router;
}