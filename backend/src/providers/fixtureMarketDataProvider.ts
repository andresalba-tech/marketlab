import type { MarketDataProvider } from "../types/market.js";
import { getMarketFixture } from "../services/getMarketFixture.js";
import { normalizeCandles } from "../services/normalizeCandles.js";
import { filterCandlesByRange } from "../services/filterCandlesByRange.js";

export const fixtureMarketDataProvider: MarketDataProvider = {
  async getMarket({ symbol, interval, from, to }) {
    const normalizedSymbol = symbol.trim().toUpperCase();
    const fixture = getMarketFixture(interval, normalizedSymbol);

    if (fixture === null) {
        throw new Error(
            `No hay datos para ${normalizedSymbol} en el intervalo ${interval}.`,
        );
    }

    const normalizedCandles = normalizeCandles(fixture.candles);

    const candles = filterCandlesByRange(
      normalizedCandles,
      from,
      to,
    );

    return {
      symbol: fixture.symbol,
      interval: fixture.interval,
      source: fixture.source,
      candles,
    };
  },
};