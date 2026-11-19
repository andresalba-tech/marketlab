import assert from "node:assert/strict";
import indicator from "../indicators/vwap.js";
import type { Candle } from "../types/indicator.js";

const candles: Candle[] = [
  {
    time: "2026-11-18T14:30:00Z",
    session: "2026-11-18",
    open: 100,
    high: 100,
    low: 100,
    close: 100,
    volume: 10,
  },
  {
    time: "2026-11-18T14:35:00Z",
    session: "2026-11-18",
    open: 110,
    high: 110,
    low: 110,
    close: 110,
    volume: 30,
  },
  {
    time: "2026-11-19T14:30:00Z",
    session: "2026-11-19",
    open: 200,
    high: 200,
    low: 200,
    close: 200,
    volume: 0,
  },
  {
    time: "2026-11-19T14:35:00Z",
    session: "2026-11-19",
    open: 210,
    high: 210,
    low: 210,
    close: 210,
    volume: 20,
  },
];

const result = indicator.calculate({
  candles,
  interval: "5m",
});

const series = result.series[0];
assert.ok(series);

assert.equal(result.display.placement, "overlay");

assert.deepEqual(
  series.points.map((point) => point.value),
  [100, 107.5, null, 210],
);

assert.deepEqual(
  series.points.map((point) => point.time),
  candles.map((candle) => candle.time),
);

// Comprueba que utiliza high, low y close, no solo close.
const typicalPriceResult = indicator.calculate({
  interval: "5m",
  candles: [
    {
      time: "2026-11-19T14:30:00Z",
      session: "2026-11-19",
      open: 100,
      high: 120,
      low: 90,
      close: 105,
      volume: 10,
    },
  ],
});

assert.equal(typicalPriceResult.series[0]?.points[0]?.value, 105);

// Rechaza intervalos diarios.
assert.throws(
  () => indicator.calculate({ candles, interval: "1d" }),
  /VWAP requiere un intervalo intradía compatible/,
);

// Rechaza velas sin sesión.
assert.throws(
  () =>
    indicator.calculate({
      interval: "5m",
      candles: candles.map(({ session, ...candle }) => candle),
    }),
  /Cada vela de VWAP debe indicar su sesión/,
);

// Rechaza volumen negativo.
assert.throws(
  () =>
    indicator.calculate({
      interval: "5m",
      candles: candles.map((candle) => ({
        ...candle,
        volume: -1,
      })),
    }),
  /El volumen debe ser finito y no negativo/,
);

console.log("VWAP: todas las comprobaciones pasaron.");