import { Router, json } from "express";
import { randomUUID } from "node:crypto";
import type {
  ChatMessage,
  LlmClient,
  LlmMessage,
} from "../types/chat.js";
import { runAgentTurn } from "../agent/runAgentTurn.js";

type ChatSession = {
  messages: ChatMessage[];
  history: LlmMessage[];
  busy: boolean;
};

export function createChatRouter(llmClient: LlmClient) {
  const router = Router();
  const sessions = new Map<string, ChatSession>();

  router.post(
    "/sessions/:id/messages",
    json({ limit: "32kb" }),
    async (req, res) => {
      const sessionId = req.params.id;
      const body: unknown = req.body;

      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(sessionId)) {
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

      const session = sessions.get(sessionId) ?? {
        messages: [],
        history: [],
        busy: false,
      };

      if (session.busy) {
        res.status(409).json({
          error: "La sesión ya está procesando un mensaje.",
        });
        return;
      }

      session.busy = true;
      sessions.set(sessionId, session);

      const text = body.text.trim();

      const userMessage: ChatMessage = {
        id: randomUUID(),
        role: "user",
        blocks: [{ type: "markdown", text }],
        status: "completed",
        toolTraces: [],
      };

      try {
        const turn = await runAgentTurn({
          llmClient,
          history: [
            ...session.history,
            { role: "user", text },
          ],
          llmTimeoutMs: 60000,
        });

        session.history = turn.history;
        session.messages.push(userMessage, turn.message);

        res.json(turn.message);
      } catch {
        res.status(500).json({
          error: "No se pudo procesar el mensaje.",
        });
      } finally {
        session.busy = false;
      }
    },
  );

  return router;
}