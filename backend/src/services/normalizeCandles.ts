import type { Candle } from "../types/indicator.js";

export function normalizeCandles(
  candles: readonly Candle[],
): Candle[] {
  const times = new Set<number>();

  const normalized = candles.map((candle) => {
    const timestamp = Date.parse(candle.time);

    if (!Number.isFinite(timestamp)) {
      throw new Error(`Fecha inválida: ${candle.time}`);
    }

    if (times.has(timestamp)) {
      throw new Error(`Fecha duplicada: ${candle.time}`);
    }

    times.add(timestamp);

    const values = [
      candle.open,
      candle.high,
      candle.low,
      candle.close,
      candle.volume,
    ];

    if (!values.every(Number.isFinite)) {
      throw new Error(
        `La vela ${candle.time} contiene valores no finitos.`,
      );
    }

    if (candle.volume < 0) {
      throw new Error(
        `La vela ${candle.time} tiene volumen negativo.`,
      );
    }

    if (
      candle.low > candle.high ||
      candle.open < candle.low ||
      candle.open > candle.high ||
      candle.close < candle.low ||
      candle.close > candle.high
    ) {
      throw new Error(
        `La vela ${candle.time} tiene precios OHLC incoherentes.`,
      );
    }

    return { ...candle };
  });

  normalized.sort(
    (a, b) => Date.parse(a.time) - Date.parse(b.time),
  );

  return normalized;
}