export type StrategyDefinition = {
  name: "rsi2";
  entryBelow: 10;
  exitAbove: 70;
};

export type BacktestRequest = {
  symbol: string;
  interval: string;
  strategy: StrategyDefinition;
  from?: string;
  to?: string;
  initialCapital: number;
  commissionBps: number;
};

export type BacktestAssumptions = {
  direction: "long-only";
  allocation: "all-available-cash";
  fractionalShares: true;
  leverage: false;
  signalTiming: "candle-close";
  executionTiming: "next-candle-open";
  warmup: "use-prior-history-no-trading";
  firstSignal: "first-candle-in-window";
  finalPosition: "close-at-last-candle-close";
  commissionBps: number;
  commissionCharged: "entry-and-exit";
  slippageBps: 0;
  benchmark: "buy-first-open-sell-last-close";
};

export type BacktestTrade = {
  entryTime: string;
  entryPrice: number;
  exitTime: string;
  exitPrice: number;
  quantity: number;
  entryCommission: number;
  exitCommission: number;
  netPnl: number;
  returnPct: number;
  exitReason: "signal" | "end-of-period";
};

export type EquityPoint = {
  time: string;
  equity: number;
  drawdownPct: number;
};

export type BacktestMetrics = {
  finalCapital: number;
  totalReturnPct: number;
  maxDrawdownPct: number;
  tradeCount: number;
  winRatePct: number;
};

export type BacktestBenchmark = {
  name: "buy-and-hold";
  finalCapital: number;
  totalReturnPct: number;
  maxDrawdownPct: number;
  equityCurve: EquityPoint[];
};

export type BacktestResult = {
  id: string;
  request: BacktestRequest;
  source: string;
  assumptions: BacktestAssumptions;
  metrics: BacktestMetrics;
  equityCurve: EquityPoint[];
  trades: BacktestTrade[];
  benchmark: BacktestBenchmark;
};