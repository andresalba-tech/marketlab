import { useRef, useState } from "react";
import { useSendChatMessageMutation } from "../marketApi";
import type { AgentBlock, ChatMessage } from "../chatTypes";

function ChatBlock({ block }: { block: AgentBlock }) {
  switch (block.type) {
    case "markdown":
      return <p style={{ whiteSpace: "pre-wrap" }}>{block.text}</p>;

    case "error":
      return <p role="alert">{block.message}</p>;

    case "table":
      return (
        <div style={{ overflowX: "auto" }}>
          <table>
            <caption>{block.title}</caption>
            <thead>
              <tr>
                {block.columns.map((column, index) => (
                  <th key={index} scope="col">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, columnIndex) => (
                    <td key={columnIndex}>
                      {cell === null ? "—" : String(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "file":
      // Solo permitimos enlaces de nuestra ruta de reportes.
      if (
        !/^\/api\/reports\/[a-zA-Z0-9_-]+\/download$/.test(
          block.downloadUrl,
        )
      ) {
        return <p role="alert">Enlace de descarga inválido.</p>;
      }

      return (
        <p>
          <a href={block.downloadUrl} download={block.filename}>
            Descargar {block.filename}
          </a>
        </p>
      );
  }
}

export function ChatPanel() {
  const [sessionId] = useState(() => crypto.randomUUID());
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [requestError, setRequestError] = useState<string | null>(null);

  const sending = useRef(false);
  const [sendChatMessage, { isLoading }] = useSendChatMessageMutation();

  async function sendMessage(): Promise<void> {
    const question = text.trim();

    if (!question || question.length > 4000 || sending.current) {
      return;
    }

    sending.current = true;
    setRequestError(null);

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      blocks: [{ type: "markdown", text: question }],
      status: "pending",
      toolTraces: [],
    };

    setMessages((previous) => [...previous, userMessage]);
    setText("");

    try {
      const response = await sendChatMessage({
        sessionId,
        text: question,
      }).unwrap();

      setMessages((previous) => [
        ...previous.map((message): ChatMessage =>
          message.id === userMessage.id
            ? { ...message, status: "completed" }
            : message,
        ),
        response,
      ]);
    } catch {
      setMessages((previous) =>
        previous.map((message): ChatMessage =>
          message.id === userMessage.id
            ? { ...message, status: "error" }
            : message,
        ),
      );

      setText(question);
      setRequestError(
        "No se pudo recibir la respuesta. El servidor podría haber procesado el mensaje.",
      );
    } finally {
      sending.current = false;
    }
  }

  return (
    <section aria-label="Chat de MarketLab">
      <h2>Asistente de MarketLab</h2>

      <p>
        Puedes pedir indicadores, backtests, comparaciones y reportes CSV.
        Los datos son simulados.
      </p>

      <p>
        Indica el símbolo, intervalo y rango en tu pregunta.
        El chat todavía no recibe los filtros del dashboard.
      </p>

      {messages.map((message) => (
        <article key={message.id}>
          <h3>{message.role === "user" ? "Tú" : "MarketLab"}</h3>

          {message.blocks.map((block, index) => (
            <ChatBlock key={index} block={block} />
          ))}

          {message.role === "user" && message.status === "error" && (
            <p>No se pudo confirmar la recepción de este mensaje.</p>
          )}

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

      {isLoading && (
        <p role="status">El agente está procesando tu solicitud...</p>
      )}

      {requestError && <p role="alert">{requestError}</p>}

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
          disabled={isLoading}
          style={{ display: "block", width: "100%" }}
        />

        <button
          type="submit"
          disabled={isLoading || text.trim() === ""}
        >
          {isLoading ? "Procesando..." : "Enviar"}
        </button>
      </form>
    </section>
  );
}