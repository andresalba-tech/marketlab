import assert from "node:assert/strict";
import indicator from "../indicators/momentum12_1.js";
import type { Candle } from "../types/indicator.js";

function createCandles(): Candle[] {
  const candles: Candle[] = [];
  const date = new Date("2025-01-06T00:00:00Z");

  while (candles.length < 253) {
    const day = date.getUTCDay();

    if (day !== 0 && day !== 6) {
      candles.push({
        time: date.toISOString().slice(0, 10),
        open: 100,
        high: 100,
        low: 100,
        close: 100,
        volume: 1000,
      });
    }

    date.setUTCDate(date.getUTCDate() + 1);
  }

  return candles;
}

function getPoints(candles: Candle[]) {
  const result = indicator.calculate({ candles, interval: "1d" });
  const series = result.series[0];

  assert.ok(series);
  assert.equal(result.display.placement, "panel");

  return series.points;
}

const candles = createCandles();

// Para la posición 252, el cierre utilizado es el de 252 - 21 = 231.
const referenceCandle = candles[231];
assert.ok(referenceCandle);

referenceCandle.close = 120;
referenceCandle.high = 120;

const points = getPoints(candles);

assert.equal(points.length, 253);
assert.ok(
  points.slice(0, 252).every((point) => point.value === null),
);

const firstValue = points[252]?.value;
assert.ok(typeof firstValue === "number");
assert.ok(Math.abs(firstValue - 20) < 1e-8);

// Cambiar las últimas 21 sesiones no debe alterar ese resultado.
const changedRecent = candles.map((candle, index) =>
  index > 231
    ? { ...candle, high: 999, close: 999 }
    : { ...candle },
);

assert.equal(getPoints(changedRecent)[252]?.value, firstValue);

// El historial todavía es insuficiente con 252 velas.
assert.ok(
  getPoints(candles.slice(0, 252)).every((point) => point.value === null),
);

// Sin datos, devuelve una serie vacía.
assert.deepEqual(getPoints([]), []);

// Un cierre base igual a cero debe producir un error.
const invalidCandles = candles.map((candle, index) =>
  index === 0
    ? { ...candle, low: 0, close: 0 }
    : { ...candle },
);

assert.throws(
  () =>
    indicator.calculate({
      candles: invalidCandles,
      interval: "1d",
    }),
  /El cierre base debe ser mayor que cero/,
);

assert.throws(
  () => indicator.calculate({ candles, interval: "1h" }),
  /Momentum 12-1 requiere velas diarias/,
);
console.log("Momentum 12-1: todas las comprobaciones pasaron.");