import { useEffect, useRef, useState } from "react";
import { useSendChatMessageMutation } from "../marketApi";
import type { ChatMessage, ChatStreamEvent } from "../chatTypes";
import {
  applyChatStreamEvent,
  upsertChatMessage,
  type ChatStreamState,
} from "../chatStream";
import { AgentBlockRenderer } from "./AgentBlockRenderer";

export function ChatPanel() {
  const [sessionId] = useState(() => crypto.randomUUID());
  const [text, setText] = useState("");

  const [chat, setChat] = useState<ChatStreamState>({
    messages: [],
    lastSequence: 0,
    runningTools: [],
  });

  const [connected, setConnected] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelRequested, setCancelRequested] = useState(false);

  const sending = useRef(false);
  const cancelling = useRef(false);

  const [sendChatMessage, { isLoading }] = useSendChatMessageMutation();

  const hasPendingAssistant = chat.messages.some(
    (message) =>
      message.role === "assistant" && message.status === "pending",
  );

  const busy = isLoading || hasPendingAssistant;

  useEffect(() => {
    const source = new EventSource(
      `/api/chat/sessions/${encodeURIComponent(sessionId)}/events`,
    );

    source.onopen = () => {
      setConnected(true);
    };

    source.onerror = () => {
      setConnected(false);
      // EventSource intenta reconectar automáticamente.
      // No creamos otra instancia: conserva Last-Event-ID.
    };

    source.onmessage = (incoming) => {
      try {
        const event = JSON.parse(incoming.data) as ChatStreamEvent;

        if (
          event.sessionId !== sessionId ||
          typeof event.messageId !== "string" ||
          !Number.isSafeInteger(event.sequence) ||
          event.sequence < 1
        ) {
          throw new Error("Evento inválido.");
        }

        setChat((previous) =>
          applyChatStreamEvent(previous, event),
        );
      } catch {
        setRequestError(
          "No se pudo interpretar un evento del servidor.",
        );
      }
    };

    return () => {
      source.close();
    };
  }, [sessionId]);

  async function sendMessage(): Promise<void> {
    const question = text.trim();

    if (
      !question ||
      question.length > 4000 ||
      sending.current ||
      busy ||
      !connected
    ) {
      return;
    }

    sending.current = true;
    setRequestError(null);
    setCancelError(null);
    setCancelRequested(false);

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      blocks: [
        {
          id: crypto.randomUUID(),
          type: "markdown",
          text: question,
        },
      ],
      status: "pending",
      toolTraces: [],
    };

    setChat((previous) => ({
      ...previous,
      messages: [...previous.messages, userMessage],
    }));

    setText("");

    try {
      const response = await sendChatMessage({
        sessionId,
        text: question,
      }).unwrap();

      setChat((previous) => ({
        ...previous,
        messages: upsertChatMessage(
          previous.messages.map((message): ChatMessage =>
            message.id === userMessage.id
              ? { ...message, status: "completed" }
              : message,
          ),
          response,
        ),
        runningTools: previous.runningTools.filter(
          (tool) => tool.messageId !== response.id,
        ),
      }));
    } catch {
      setChat((previous) => ({
        ...previous,
        messages: previous.messages.map((message): ChatMessage =>
          message.id === userMessage.id
            ? { ...message, status: "error" }
            : message,
        ),
      }));

      setText(question);
      setRequestError(
        "No se pudo confirmar la respuesta del POST. " +
        "El turno podría continuar y recibirse por la conexión de eventos.",
      );
    } finally {
      sending.current = false;
    }
  }

  async function cancelTurn(): Promise<void> {
    if (!busy || cancelling.current || cancelRequested) {
      return;
    }

    cancelling.current = true;
    setIsCancelling(true);
    setCancelError(null);

    try {
      const response = await fetch(
        `/api/chat/sessions/${encodeURIComponent(sessionId)}/cancel`,
        {
          method: "POST",
          signal: AbortSignal.timeout(10000),
        },
      );

      if (!response.ok) {
        throw new Error("No se pudo solicitar la cancelación.");
      }

      const result: unknown = await response.json();

      if (
        typeof result !== "object" ||
        result === null ||
        !("cancellationRequested" in result) ||
        typeof result.cancellationRequested !== "boolean"
      ) {
        throw new Error("Respuesta de cancelación inválida.");
      }

      setCancelRequested(result.cancellationRequested);
    } catch {
      setCancelError(
        "No se pudo confirmar la cancelación. Puedes intentarlo otra vez.",
      );
    } finally {
      cancelling.current = false;
      setIsCancelling(false);
    }
  }

  return (
    <section aria-label="Chat de MarketLab">
      <h2>Asistente de MarketLab</h2>

      <p>
        Puedes pedir indicadores, backtests, comparaciones y reportes
        CSV o SVG. Los datos son simulados.
      </p>

      <p>
        Indica el símbolo, intervalo y rango en tu pregunta.
        El chat todavía no recibe los filtros del dashboard.
      </p>

      {!connected && (
        <p role="status">
          Conectando con los eventos del chat...
        </p>
      )}

      {chat.messages.map((message) => (
        <article key={message.id}>
          <h3>{message.role === "user" ? "Tú" : "MarketLab"}</h3>

          {message.blocks.map((block) => (
            <AgentBlockRenderer key={block.id} block={block} />
          ))}

          {message.role === "user" && message.status === "error" && (
            <p>No se pudo confirmar la recepción de este mensaje.</p>
          )}

          {chat.runningTools
            .filter((tool) => tool.messageId === message.id)
            .map((tool) => (
              <p key={tool.toolCallId} role="status">
                Ejecutando {tool.toolName}...
              </p>
            ))}

          {message.toolTraces.length > 0 && (
            <details>
              <summary>
                Herramientas utilizadas ({message.toolTraces.length})
              </summary>

              <ul>
                {message.toolTraces.map((trace, index) => (
                  <li key={index}>
                    {trace.toolName}
                    {" · "}
                    {trace.ok ? "Correcta" : "Error"}
                    {" · "}
                    {Math.round(trace.durationMs)} ms
                    {trace.error && ` · ${trace.error.message}`}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </article>
      ))}

      {busy && (
        <div>
          <p role="status">
            {cancelRequested
              ? "Cancelación solicitada..."
              : "El agente está procesando tu solicitud..."}
          </p>

          <button
            type="button"
            onClick={() => void cancelTurn()}
            disabled={
              !hasPendingAssistant ||
              isCancelling ||
              cancelRequested
            }
          >
            {isCancelling ? "Cancelando..." : "Cancelar"}
          </button>
        </div>
      )}

      {requestError && <p role="alert">{requestError}</p>}
      {cancelError && <p role="alert">{cancelError}</p>}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void sendMessage();
        }}
      >
        <label htmlFor="chat-question">Tu pregunta</label>

        <textarea
          id="chat-question"
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={4000}
          rows={4}
          required
          disabled={busy}
          style={{ display: "block", width: "100%" }}
        />

        <button
          type="submit"
          disabled={busy || !connected || text.trim() === ""}
        >
          {busy ? "Procesando..." : "Enviar"}
        </button>
      </form>
    </section>
  );
}