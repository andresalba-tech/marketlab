import assert from "node:assert/strict";
import { normalizeCandles } from "../services/normalizeCandles.js";
import { filterCandlesByRange } from "../services/filterCandlesByRange.js";
import { fixtureMarketDataProvider } from "../providers/fixtureMarketDataProvider.js";
import type { Candle } from "../types/indicator.js";

const validCandle: Candle = {
  time: "2026-11-18",
  open: 100,
  high: 105,
  low: 98,
  close: 102,
  volume: 1000,
};

// --- normalizeCandles ---

// Ordena cronológicamente y no muta los datos originales.
const unsorted: Candle[] = [
  { ...validCandle, time: "2026-11-20", close: 104 },
  { ...validCandle, time: "2026-11-18", close: 102 },
  { ...validCandle, time: "2026-11-19", close: 103 },
];
const unsortedSnapshot = structuredClone(unsorted);
const normalized = normalizeCandles(unsorted);

assert.deepEqual(
  normalized.map((candle) => candle.time),
  ["2026-11-18", "2026-11-19", "2026-11-20"],
);
assert.deepEqual(unsorted, unsortedSnapshot);
assert.notEqual(normalized[0], unsorted[1]);

// Array vacío se conserva vacío.
assert.deepEqual(normalizeCandles([]), []);

// Fecha inválida.
assert.throws(
  () => normalizeCandles([{ ...validCandle, time: "no-es-fecha" }]),
  /Fecha inválida/,
);

// Fechas duplicadas.
assert.throws(
  () =>
    normalizeCandles([
      validCandle,
      { ...validCandle, close: 103 },
    ]),
  /Fecha duplicada/,
);

// Valores no finitos.
assert.throws(
  () => normalizeCandles([{ ...validCandle, close: Number.NaN }]),
  /no finitos/,
);
assert.throws(
  () => normalizeCandles([{ ...validCandle, volume: Number.POSITIVE_INFINITY }]),
  /no finitos/,
);

// Volumen negativo.
assert.throws(
  () => normalizeCandles([{ ...validCandle, volume: -10 }]),
  /volumen negativo/,
);

// Precios OHLC incoherentes.
assert.throws(
  () => normalizeCandles([{ ...validCandle, low: 110, high: 105 }]),
  /OHLC incoherentes/,
);
assert.throws(
  () => normalizeCandles([{ ...validCandle, open: 106 }]),
  /OHLC incoherentes/,
);
assert.throws(
  () => normalizeCandles([{ ...validCandle, close: 97 }]),
  /OHLC incoherentes/,
);

// --- filterCandlesByRange ---

const dailyCandles: Candle[] = [
  { ...validCandle, time: "2026-11-17" },
  { ...validCandle, time: "2026-11-18" },
  { ...validCandle, time: "2026-11-19" },
  { ...validCandle, time: "2026-11-20" },
];

// Sin límites devuelve todo.
assert.equal(filterCandlesByRange(dailyCandles).length, 4);

// Rango inclusivo en velas diarias.
assert.deepEqual(
  filterCandlesByRange(dailyCandles, "2026-11-18", "2026-11-19").map(
    (candle) => candle.time,
  ),
  ["2026-11-18", "2026-11-19"],
);

// Rango inclusivo en velas intradía: incluye todo el día de `to`.
const intradayCandles: Candle[] = [
  { ...validCandle, time: "2026-11-18T14:30:00Z", session: "2026-11-18" },
  { ...validCandle, time: "2026-11-18T20:55:00Z", session: "2026-11-18" },
  { ...validCandle, time: "2026-11-19T14:30:00Z", session: "2026-11-19" },
];

assert.deepEqual(
  filterCandlesByRange(intradayCandles, "2026-11-18", "2026-11-18").map(
    (candle) => candle.time,
  ),
  ["2026-11-18T14:30:00Z", "2026-11-18T20:55:00Z"],
);

// Formatos y fechas inválidas.
assert.throws(
  () => filterCandlesByRange(dailyCandles, "2026/11/18"),
  /YYYY-MM-DD/,
);
assert.throws(
  () => filterCandlesByRange(dailyCandles, ""),
  /YYYY-MM-DD/,
);
assert.throws(
  () => filterCandlesByRange(dailyCandles, "2026-02-30"),
  /Fecha inválida/,
);
assert.throws(
  () => filterCandlesByRange(dailyCandles, undefined, "2026-04-31"),
  /Fecha inválida/,
);
assert.throws(
  () => filterCandlesByRange(dailyCandles, "2026-11-20", "2026-11-18"),
  /from no puede ser posterior a to/,
);

// --- fixtureMarketDataProvider ---

const msftDaily = await fixtureMarketDataProvider.getMarket({
  symbol: "msft",
  interval: "1d",
});
const aaplDaily = await fixtureMarketDataProvider.getMarket({
  symbol: "AAPL",
  interval: "1d",
});

assert.equal(msftDaily.symbol, "MSFT");
assert.equal(aaplDaily.symbol, "AAPL");
assert.equal(msftDaily.source, "fixture");
assert.equal(aaplDaily.candles.length, msftDaily.candles.length);
assert.equal(
  aaplDaily.candles[0]?.close,
  Number(((msftDaily.candles[0]?.close ?? 0) * 0.5).toFixed(2)),
);

const rangedIntraday = await fixtureMarketDataProvider.getMarket({
  symbol: "AAPL",
  interval: "5m",
  from: "2026-11-18",
  to: "2026-11-18",
});
assert.equal(rangedIntraday.candles.length, 78);

await assert.rejects(
  () =>
    fixtureMarketDataProvider.getMarket({
      symbol: "TSLA",
      interval: "1d",
    }),
  /No hay datos/,
);

console.log("Datos de mercado: todas las comprobaciones pasaron.");
