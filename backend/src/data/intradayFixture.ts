import type { Candle } from "../types/indicator.js";

function createIntradayCandles(): Candle[] {
  const candles: Candle[] = [];
  const sessions = ["2026-11-18", "2026-11-19"];

  for (const [sessionIndex, session] of sessions.entries()) {
    const sessionStart = new Date(`${session}T14:30:00Z`);
    let previousClose = 400 + sessionIndex * 5;

    for (let index = 0; index < 78; index++) {
      const time = new Date(
        sessionStart.getTime() + index * 5 * 60 * 1000,
      ).toISOString();

      const close = Number(
        (
          400 +
          sessionIndex * 5 +
          index * 0.04 +
          Math.sin(index / 6) * 2
        ).toFixed(2),
      );

      const open = previousClose;

      candles.push({
        time,
        session,
        open,
        high: Number((Math.max(open, close) + 0.3).toFixed(2)),
        low: Number((Math.min(open, close) - 0.3).toFixed(2)),
        close,
        volume: 10000 + (index % 10) * 1000,
      });

      previousClose = close;
    }
  }

  return candles;
}

export const intradayFixture = {
  symbol: "MSFT",
  interval: "5m",
  source: "fixture",
  candles: createIntradayCandles(),
};