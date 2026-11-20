import { marketFixture } from "../data/marketFixture.js";
import { intradayFixture } from "../data/intradayFixture.js";
import type { MarketData } from "../types/market.js";

function createAaplFixture(fixture: MarketData): MarketData {
  const scale = (price: number) => Number((price * 0.5).toFixed(2));

  return {
    ...fixture,
    symbol: "AAPL",
    candles: fixture.candles.map((candle) => ({
      ...candle,
      open: scale(candle.open),
      high: scale(candle.high),
      low: scale(candle.low),
      close: scale(candle.close),
    })),
  };
}

const fixturesBySymbol: Record<string, Record<string, MarketData>> = {
  MSFT: {
    "1d": marketFixture,
    "5m": intradayFixture,
  },
  AAPL: {
    "1d": createAaplFixture(marketFixture),
    "5m": createAaplFixture(intradayFixture),
  },
};

export function getMarketFixture(
  interval: string,
  symbol = "MSFT",
): MarketData | null {
  const normalizedSymbol = symbol.trim().toUpperCase();

  if (!Object.hasOwn(fixturesBySymbol, normalizedSymbol)) {
    return null;
  }

  const fixtures = fixturesBySymbol[normalizedSymbol];

  if (!fixtures || !Object.hasOwn(fixtures, interval)) {
    return null;
  }

  return fixtures[interval] ?? null;
}