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