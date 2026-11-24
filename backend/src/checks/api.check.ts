import assert from "node:assert/strict";
import { once } from "node:events";
import { createApp } from "../app.js";
import type { LlmClient } from "../types/chat.js";
import { generateReport } from "../agent/tools.js";
import { getReport } from "../services/reportStore.js";

let chatCompletions = 0;

let notifyCancellationStarted: () => void = () => {};

const cancellationStarted = new Promise<void>((resolve) => {
  notifyCancellationStarted = resolve;
});

const mockChatClient: LlmClient = {
  async complete(request) {
    chatCompletions += 1;

    const latest = request.messages.at(-1);

    assert.ok(latest?.role === "user");

    if (latest.text === "Prueba de cancelación HTTP") {
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

        notifyCancellationStarted();
      });
    }

    assert.equal(latest.text, "Hola MarketLab");

    return {
      text: "Hola. Estoy listo para analizar datos simulados.",
      toolCalls: [],
    };
  },
};

const app = createApp({
  llmClient: mockChatClient,
});

// El puerto 0 permite que el sistema elija uno disponible.
const server = app.listen(0, "127.0.0.1");

try {
  await once(server, "listening");

  const address = server.address();

  if (address === null || typeof address === "string") {
    throw new Error("No se pudo obtener el puerto de prueba.");
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;

  const response = await fetch(`${baseUrl}/health`, {
    signal: AbortSignal.timeout(5000),
  });

  assert.equal(response.status, 200);

  const body: unknown = await response.json();

  assert.deepEqual(body, {
    status: "ok",
  });
  const incompatibleResponse = await fetch(
    `${baseUrl}/api/market/MSFT/indicators/vwap?interval=1d`,
    {
      signal: AbortSignal.timeout(5000),
    },
  );

  assert.equal(incompatibleResponse.status, 400);

  const incompatibleBody: unknown =
    await incompatibleResponse.json();

  assert.deepEqual(incompatibleBody, {
    error: "El indicador vwap no admite el intervalo 1d.",
    supportedIntervals: ["1m", "5m", "15m", "30m", "1h"],
  });

  const intradayListResponse = await fetch(
    `${baseUrl}/api/indicators?interval=5m`,
    {
      signal: AbortSignal.timeout(5000),
    },
  );

  assert.equal(intradayListResponse.status, 200);

  const intradayListBody: unknown =
    await intradayListResponse.json();

  assert.deepEqual(intradayListBody, {
    indicators: ["rsi2", "vwap"],
  });

  const dailyListResponse = await fetch(
    `${baseUrl}/api/indicators?interval=1d`,
    {
      signal: AbortSignal.timeout(5000),
    },
  );

  assert.equal(dailyListResponse.status, 200);

  const dailyListBody: unknown =
    await dailyListResponse.json();

  assert.deepEqual(dailyListBody, {
    indicators: ["momentum12_1", "rsi2", "sma200"],
  });

  // Segundo símbolo (AAPL) disponible en la demo.
  const aaplResponse = await fetch(
    `${baseUrl}/api/market/AAPL?interval=1d`,
    {
      signal: AbortSignal.timeout(5000),
    },
  );

  assert.equal(aaplResponse.status, 200);

  const aaplBody = (await aaplResponse.json()) as {
    symbol: string;
    interval: string;
    source: string;
    candles: { time: string; close: number }[];
  };

  assert.equal(aaplBody.symbol, "AAPL");
  assert.equal(aaplBody.interval, "1d");
  assert.equal(aaplBody.source, "fixture");
  assert.equal(aaplBody.candles.length, 300);

  // Símbolo inexistente devuelve 404.
  const missingSymbolResponse = await fetch(
    `${baseUrl}/api/market/TSLA?interval=1d`,
    {
      signal: AbortSignal.timeout(5000),
    },
  );
  assert.equal(missingSymbolResponse.status, 404);

  // Fechas inválidas o invertidas devuelven 400.
  const invalidDateResponse = await fetch(
    `${baseUrl}/api/market/MSFT?interval=1d&from=2026-02-30`,
    {
      signal: AbortSignal.timeout(5000),
    },
  );
  assert.equal(invalidDateResponse.status, 400);

  const invertedRangeResponse = await fetch(
    `${baseUrl}/api/market/MSFT?interval=1d&from=2025-12-01&to=2025-11-01`,
    {
      signal: AbortSignal.timeout(5000),
    },
  );
  assert.equal(invertedRangeResponse.status, 400);

  // SMA 200 con rango tardío conserva el calentamiento calculado sobre todo el historial.
  const fullSmaResponse = await fetch(
    `${baseUrl}/api/market/MSFT/indicators/sma200?interval=1d`,
    {
      signal: AbortSignal.timeout(5000),
    },
  );
  assert.equal(fullSmaResponse.status, 200);

  const fullSmaBody = (await fullSmaResponse.json()) as {
    series: { points: { time: string; value: number | null }[] }[];
  };
  const fullPoints = fullSmaBody.series[0]?.points ?? [];
  const lastThirty = fullPoints.slice(-30);
  const lateFrom = lastThirty[0]?.time;

  assert.ok(lateFrom, "Debe existir una fecha para probar el rango tardío.");

  const rangedSmaResponse = await fetch(
    `${baseUrl}/api/market/MSFT/indicators/sma200?interval=1d&from=${encodeURIComponent(lateFrom)}`,
    {
      signal: AbortSignal.timeout(5000),
    },
  );
  assert.equal(rangedSmaResponse.status, 200);

  const rangedSmaBody = (await rangedSmaResponse.json()) as {
    series: { points: { time: string; value: number | null }[] }[];
  };
  const rangedPoints = rangedSmaBody.series[0]?.points ?? [];

  assert.equal(rangedPoints.length, lastThirty.length);
  assert.ok(
    rangedPoints.every((point) => typeof point.value === "number"),
    "SMA 200 con rango tardío debe conservar valores calculados, no null.",
  );
  assert.deepEqual(rangedPoints, lastThirty);
    // Crear un backtest devuelve 201 y un ID.
  const createBacktestResponse = await fetch(
    `${baseUrl}/api/backtests`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        symbol: "MSFT",
        interval: "1d",
        strategy: {
          name: "rsi2",
          entryBelow: 10,
          exitAbove: 70,
        },
        initialCapital: 10000,
        commissionBps: 10,
      }),
      signal: AbortSignal.timeout(5000),
    },
  );

  assert.equal(createBacktestResponse.status, 201);

  const createdBacktest: unknown =
    await createBacktestResponse.json();

  assert.ok(
    typeof createdBacktest === "object" &&
      createdBacktest !== null &&
      "id" in createdBacktest &&
      typeof createdBacktest.id === "string" &&
      createdBacktest.id.length > 0,
    "El backtest creado debe contener un ID no vacío.",
  );

  const backtestId = createdBacktest.id;

  assert.equal(
    createBacktestResponse.headers.get("location"),
    `/api/backtests/${backtestId}`,
  );

  // Recuperar el ID devuelve exactamente el resultado guardado.
  const savedBacktestResponse = await fetch(
    `${baseUrl}/api/backtests/${encodeURIComponent(backtestId)}`,
    {
      signal: AbortSignal.timeout(5000),
    },
  );

  assert.equal(savedBacktestResponse.status, 200);

  const savedBacktest: unknown =
    await savedBacktestResponse.json();

  assert.deepEqual(savedBacktest, createdBacktest);

  // Generar y descargar CSV y SVG del backtest creado.
  for (const format of ["csv", "svg"] as const) {
    const generatedReport = await generateReport({
      backtestId,
      format,
    });

    const storedReport = getReport(generatedReport.reportId);
    assert.ok(storedReport);

    const downloadResponse = await fetch(
      `${baseUrl}${generatedReport.downloadUrl}`,
      {
        signal: AbortSignal.timeout(5000),
      },
    );

    assert.equal(downloadResponse.status, 200);

    const expectedMimeType =
      format === "svg" ? "image/svg+xml" : "text/csv";

    assert.equal(
      downloadResponse.headers.get("content-type"),
      `${expectedMimeType}; charset=utf-8`,
    );

    const disposition =
      downloadResponse.headers.get("content-disposition");

    assert.ok(
      disposition ===
        `attachment; filename="${generatedReport.filename}"` ||
      disposition ===
        `attachment; filename=${generatedReport.filename}`,
      `Content-Disposition inesperado: ${disposition}`,
    );

    assert.equal(
      downloadResponse.headers.get("x-content-type-options"),
      "nosniff",
    );

    const downloadedContent = await downloadResponse.text();

    // Response.text() elimina el BOM UTF-8 inicial del CSV.
    const expectedContent = storedReport.content.replace(/^\uFEFF/, "");

    assert.equal(
      downloadedContent,
      expectedContent,
      `La descarga ${format} debe coincidir con el reporte guardado.`,
    );

    if (format === "svg") {
      assert.ok(downloadedContent.startsWith("<svg"));
      assert.ok(downloadedContent.includes("-21.98 %"));
      assert.ok(downloadedContent.includes("23.60 %"));
      assert.ok(downloadedContent.includes("21.98 %"));
      assert.ok(downloadedContent.includes("6.62 %"));
    } else {
      assert.ok(downloadedContent.includes('"netPnl"'));
    }
  }

  // Descargar un reporte inexistente devuelve 404.
  const missingReportResponse = await fetch(
    `${baseUrl}/api/reports/no-existe/download`,
    {
      signal: AbortSignal.timeout(5000),
    },
  );

  assert.equal(missingReportResponse.status, 404);
  assert.deepEqual(await missingReportResponse.json(), {
    error: "Reporte no encontrado.",
  });


  // Un ID inexistente devuelve 404.
  const missingBacktestResponse = await fetch(
    `${baseUrl}/api/backtests/no-existe`,
    {
      signal: AbortSignal.timeout(5000),
    },
  );

  assert.equal(missingBacktestResponse.status, 404);

  const missingBacktestBody: unknown =
    await missingBacktestResponse.json();

  assert.deepEqual(missingBacktestBody, {
    error: "Backtest no encontrado.",
  });

  // 1. Un mensaje válido devuelve un ChatMessage.
  const chatResponse = await fetch(
    `${baseUrl}/api/chat/sessions/test-session/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: "Hola MarketLab",
      }),
      signal: AbortSignal.timeout(5000),
    },
  );

  assert.equal(chatResponse.status, 200);

  const chatBody: unknown = await chatResponse.json();

  assert.ok(
    typeof chatBody === "object" &&
      chatBody !== null &&
      "id" in chatBody &&
      typeof chatBody.id === "string" &&
      chatBody.id.length > 0,
    "La respuesta debe contener un ID de mensaje.",
  );

  assert.ok(
    "blocks" in chatBody && Array.isArray(chatBody.blocks),
    "La respuesta debe contener un array de bloques.",
  );

  const chatTextBlock: unknown = chatBody.blocks[0];

  assert.ok(
    typeof chatTextBlock === "object" &&
      chatTextBlock !== null &&
      "id" in chatTextBlock &&
      typeof chatTextBlock.id === "string",
    "El primer bloque debe contener un ID.",
  );

  assert.equal(
    chatTextBlock.id,
    `${chatBody.id}-text`,
  );

  assert.deepEqual(chatBody, {
    id: chatBody.id,
    role: "assistant",
    status: "completed",
    blocks: [
      {
        id: `${chatBody.id}-text`,
        type: "markdown",
        text: "Hola. Estoy listo para analizar datos simulados.",
      },
    ],
    toolTraces: [],
  });

  assert.equal(chatCompletions, 1);

  // 2. Un mensaje vacío devuelve 400 sin llamar al modelo.
  const invalidChatResponse = await fetch(
    `${baseUrl}/api/chat/sessions/test-session/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: "   ",
      }),
      signal: AbortSignal.timeout(5000),
    },
  );

  assert.equal(invalidChatResponse.status, 400);
  assert.equal(chatCompletions, 1);
  // Iniciamos un turno que permanecerá esperando al modelo falso.
  const pendingMessage = fetch(
    `${baseUrl}/api/chat/sessions/cancel-session/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: "Prueba de cancelación HTTP",
      }),
      signal: AbortSignal.timeout(5000),
    },
  );

  // Si la petición termina o falla antes de arrancar el modelo,
  // la prueba falla en vez de quedarse esperando indefinidamente.
  await Promise.race([
    cancellationStarted,
    pendingMessage.then(() => {
      throw new Error(
        "La petición terminó antes de iniciar el modelo de cancelación.",
      );
    }),
  ]);

  const cancelResponse = await fetch(
    `${baseUrl}/api/chat/sessions/cancel-session/cancel`,
    {
      method: "POST",
      signal: AbortSignal.timeout(5000),
    },
  );

  assert.equal(cancelResponse.status, 202);
  assert.deepEqual(await cancelResponse.json(), {
    cancellationRequested: true,
  });

  // La petición original debe terminar con el mensaje cancelado.
  const cancelledResponse = await pendingMessage;
  assert.equal(cancelledResponse.status, 200);

  const cancelledBody: unknown = await cancelledResponse.json();

  assert.ok(
    typeof cancelledBody === "object" &&
      cancelledBody !== null &&
      "status" in cancelledBody &&
      "blocks" in cancelledBody &&
      Array.isArray(cancelledBody.blocks),
  );

  assert.equal(cancelledBody.status, "error");

  assert.ok(
    cancelledBody.blocks.some(
      (block: unknown) =>
        typeof block === "object" &&
        block !== null &&
        "type" in block &&
        block.type === "error" &&
        "code" in block &&
        block.code === "TURN_CANCELLED",
    ),
  );

  // El turno ya terminó: no queda una cancelación pendiente.
  const idleCancelResponse = await fetch(
    `${baseUrl}/api/chat/sessions/cancel-session/cancel`,
    {
      method: "POST",
      signal: AbortSignal.timeout(5000),
    },
  );

  assert.equal(idleCancelResponse.status, 200);
  assert.deepEqual(await idleCancelResponse.json(), {
    cancellationRequested: false,
  });

  const missingSessionResponse = await fetch(
    `${baseUrl}/api/chat/sessions/missing-session/cancel`,
    {
      method: "POST",
      signal: AbortSignal.timeout(5000),
    },
  );

  assert.equal(missingSessionResponse.status, 404);
  await missingSessionResponse.json();

  assert.equal(chatCompletions, 2);
} finally {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

console.log("API: todas las comprobaciones pasaron.");