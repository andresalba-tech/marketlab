import assert from "node:assert/strict";
import { once } from "node:events";
import { createApp } from "../app.js";
import type { ChatStreamEvent, LlmClient } from "../types/chat.js";

let notifyCancelModelStarted: () => void = () => {};

const cancelModelStarted = new Promise<void>((resolve) => {
  notifyCancelModelStarted = resolve;
});

const mockClient: LlmClient = {
  async complete(request) {
    const latest = request.messages.at(-1);

    if (
      latest?.role === "user" &&
      latest.text === "Cancelar por SSE"
    ) {
      return new Promise<never>((_resolve, reject) => {
        const onAbort = () => {
          reject(new Error("Modelo falso cancelado."));
        };

        if (request.signal.aborted) {
          onAbort();
        } else {
          request.signal.addEventListener("abort", onAbort, {
            once: true,
          });
        }

        notifyCancelModelStarted();
      });
    }

    return {
      text: "Respuesta de prueba SSE.",
      toolCalls: [],
    };
  },
};

const app = createApp({ llmClient: mockClient });
const server = app.listen(0, "127.0.0.1");

// Lee una cantidad concreta de eventos y cierra la conexión.
async function readEvents(
  response: Response,
  count: number,
): Promise<ChatStreamEvent[]> {
  assert.equal(response.status, 200);
  assert.ok(
    response.headers.get("content-type")?.startsWith("text/event-stream"),
  );
  assert.ok(response.body);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const events: ChatStreamEvent[] = [];
  let buffer = "";

  try {
    while (events.length < count) {
      const chunk = await reader.read();

      if (chunk.done) {
        throw new Error("El stream terminó antes de recibir los eventos.");
      }

      buffer += decoder.decode(chunk.value, { stream: true });

      let boundary = buffer.indexOf("\n\n");

      while (boundary !== -1 && events.length < count) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);

        const lines = frame.split("\n");
        const dataLine = lines.find((line) => line.startsWith("data: "));
        const idLine = lines.find((line) => line.startsWith("id: "));

        // Los mensajes retry y heartbeat no contienen datos.
        if (dataLine) {
          const event = JSON.parse(
            dataLine.slice("data: ".length),
          ) as ChatStreamEvent;

          assert.ok(idLine);
          assert.equal(
            Number(idLine.slice("id: ".length)),
            event.sequence,
          );

          events.push(event);
        }

        boundary = buffer.indexOf("\n\n");
      }
    }

    return events;
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}

try {
  await once(server, "listening");

  const address = server.address();
  assert.ok(address && typeof address !== "string");

  const baseUrl = `http://127.0.0.1:${address.port}`;
  const sessionUrl = `${baseUrl}/api/chat/sessions/sse-test`;

  // Abrimos el stream antes de enviar el mensaje.
  const streamResponse = await fetch(`${sessionUrl}/events`, {
    signal: AbortSignal.timeout(10000),
  });

  // Comenzamos a leer mientras se ejecuta el POST.
  const [messageResponse, events] = await Promise.all([
    fetch(`${sessionUrl}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Hola SSE" }),
      signal: AbortSignal.timeout(10000),
    }),
    readEvents(streamResponse, 3),
  ]);

  assert.equal(messageResponse.status, 200);
  const message: unknown = await messageResponse.json();

  assert.deepEqual(
    events.map((event) => event.type),
    ["message.started", "block.ready", "message.completed"],
  );

  assert.deepEqual(
    events.map((event) => event.sequence),
    [1, 2, 3],
  );

  assert.ok(
    events.every((event) => event.sessionId === "sse-test"),
  );

  const completed = events[2];
  assert.ok(completed?.type === "message.completed");
  assert.deepEqual(completed.payload.message, message);

  assert.ok(
    events.every((event) => event.messageId === completed.messageId),
  );

  // Reconectamos como si solo hubiéramos recibido el primer evento.
  const replayResponse = await fetch(`${sessionUrl}/events`, {
    headers: { "Last-Event-ID": "1" },
    signal: AbortSignal.timeout(10000),
  });

  const replayed = await readEvents(replayResponse, 2);

  assert.deepEqual(
    replayed.map((event) => event.sequence),
    [2, 3],
  );
  assert.deepEqual(replayed, events.slice(1));

  // Un cursor futuro debe rechazarse, no abrir otro stream.
  const invalidCursorResponse = await fetch(`${sessionUrl}/events`, {
    headers: { "Last-Event-ID": "999" },
    signal: AbortSignal.timeout(5000),
  });

  assert.equal(invalidCursorResponse.status, 409);
  const invalidCursorBody = await invalidCursorResponse.json();

  assert.equal(invalidCursorBody.code, "INVALID_EVENT_CURSOR");
  // Un segundo turno continúa la numeración de la misma sesión.
  const secondStream = await fetch(`${sessionUrl}/events`, {
    headers: { "Last-Event-ID": "3" },
    signal: AbortSignal.timeout(10000),
  });

  const [secondResponse, secondEvents] = await Promise.all([
    fetch(`${sessionUrl}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Segundo turno" }),
      signal: AbortSignal.timeout(10000),
    }),
    readEvents(secondStream, 3),
  ]);

  assert.equal(secondResponse.status, 200);
  const secondMessage: unknown = await secondResponse.json();

  assert.deepEqual(
    secondEvents.map((event) => event.sequence),
    [4, 5, 6],
  );

  assert.deepEqual(
    secondEvents.map((event) => event.type),
    ["message.started", "block.ready", "message.completed"],
  );

  const secondCompleted = secondEvents[2];

  assert.ok(secondCompleted?.type === "message.completed");
  assert.notEqual(secondCompleted.messageId, completed.messageId);
  assert.deepEqual(secondCompleted.payload.message, secondMessage);

  assert.ok(
    secondEvents.every(
      (event) =>
        event.sessionId === "sse-test" &&
        event.messageId === secondCompleted.messageId,
    ),
  );

  // Tercer turno: cancelación mientras el modelo está esperando.
  const cancellationStream = await fetch(`${sessionUrl}/events`, {
    headers: { "Last-Event-ID": "6" },
    signal: AbortSignal.timeout(10000),
  });

  const [cancelledResponse, cancellationEvents] = await Promise.all([
    (async () => {
      const pendingMessage = fetch(`${sessionUrl}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Cancelar por SSE" }),
        signal: AbortSignal.timeout(10000),
      });

      // Cancelamos cuando sabemos que el modelo ya está esperando.
      await Promise.race([
        cancelModelStarted,
        pendingMessage.then(() => {
          throw new Error(
            "El turno terminó antes de iniciar la prueba de cancelación.",
          );
        }),
      ]);

      const cancelResponse = await fetch(`${sessionUrl}/cancel`, {
        method: "POST",
        signal: AbortSignal.timeout(5000),
      });

      assert.equal(cancelResponse.status, 202);
      assert.deepEqual(await cancelResponse.json(), {
        cancellationRequested: true,
      });

      return await pendingMessage;
    })(),
    readEvents(cancellationStream, 3),
  ]);

  assert.equal(cancelledResponse.status, 200);
  const cancelledMessage: unknown = await cancelledResponse.json();

  assert.deepEqual(
    cancellationEvents.map((event) => event.sequence),
    [7, 8, 9],
  );

  assert.deepEqual(
    cancellationEvents.map((event) => event.type),
    ["message.started", "block.ready", "message.failed"],
  );

  const failedEvent = cancellationEvents[2];

  assert.ok(failedEvent?.type === "message.failed");
  assert.equal(failedEvent.payload.code, "TURN_CANCELLED");
  assert.equal(failedEvent.payload.cancelled, true);
  assert.equal(failedEvent.payload.message.status, "error");
  assert.deepEqual(failedEvent.payload.message, cancelledMessage);

  assert.ok(
    cancellationEvents.every(
      (event) =>
        event.sessionId === "sse-test" &&
        event.messageId === failedEvent.messageId,
    ),
  );
} finally {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });

    // Cierra conexiones de prueba que hayan quedado abiertas.
    server.closeAllConnections();
  });
}

console.log(
  "SSE: entrega, reconexión, secuencia entre turnos y cancelación superadas.",
);