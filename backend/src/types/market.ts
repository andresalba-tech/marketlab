import type { Candle } from "./indicator.js";

export type MarketDataQuery = {
  symbol: string;
  interval: string;
  from?: string;
  to?: string;
};

export type MarketData = {
  symbol: string;
  interval: string;
  source: string;
  candles: Candle[];
};

export interface MarketDataProvider {
  getMarket(query: MarketDataQuery): Promise<MarketData>;
}