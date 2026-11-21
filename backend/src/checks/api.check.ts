import assert from "node:assert/strict";
import { once } from "node:events";
import { app } from "../app.js";

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