import type { BacktestResult } from "../types/backtest.js";

const results = new Map<string, BacktestResult>();

export function saveBacktest(result: BacktestResult): void {
  results.set(result.id, result);
}

export function getBacktest(id: string): BacktestResult | undefined {
  return results.get(id);
}