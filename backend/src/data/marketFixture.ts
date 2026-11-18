import type { Candle } from "../types/indicator.js";

function createDemoCandles(): Candle[] {
  const candles: Candle[] = [];
  const date = new Date("2025-01-06T00:00:00Z");
  let previousClose = 300;

  while (candles.length < 300) {
    const day = date.getUTCDay();

    if (day !== 0 && day !== 6) {
      const index = candles.length;

      const close = Number(
        (
          300 +
          index * 0.25 +
          15 * Math.sin(index / 12)
        ).toFixed(2),
      );

      const open = previousClose;

      candles.push({
        time: date.toISOString().slice(0, 10),
        open,
        high: Number((Math.max(open, close) + 2).toFixed(2)),
        low: Number((Math.min(open, close) - 2).toFixed(2)),
        close,
        volume: 1000000 + (index % 10) * 50000,
      });

      previousClose = close;
    }

    date.setUTCDate(date.getUTCDate() + 1);
  }

  return candles;
}

export const marketFixture = {
  symbol: "MSFT",
  interval: "1d",
  source: "fixture",
  candles: createDemoCandles(),
};