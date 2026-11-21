import assert from "node:assert/strict";
import type { Candle } from "../types/indicator.js";
import type { BacktestRequest } from "../types/backtest.js";
import { runBacktest } from "../services/runBacktest.js";
import {
  calculateRsi2Signals,
  rsi2Strategy,
} from "../strategies/rsi2Strategy.js";

function near(actual: number, expected: number): void {
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    `Esperado ${expected}, recibido ${actual}`,
  );
}

function candle(
  time: string,
  open: number,
  close: number,
): Candle {
  return {
    time,
    open,
    high: Math.max(open, close) + 1,
    low: Math.min(open, close) - 1,
    close,
    volume: 1000,
  };
}

const candles: Candle[] = [
  candle("2026-01-05", 100, 100),
  candle("2026-01-06", 100, 90),
  candle("2026-01-07", 90, 80),
  candle("2026-01-08", 80, 70),
  candle("2026-01-09", 70, 120),
  candle("2026-01-12", 130, 110),
];

const request: BacktestRequest = {
  symbol: "MSFT",
  interval: "1d",
  strategy: rsi2Strategy,
  initialCapital: 1010,
  commissionBps: 100,
};

function execute(
  input: Candle[],
  query: BacktestRequest = request,
) {
  return runBacktest(
    query,
    {
      symbol: "MSFT",
      interval: "1d",
      source: "fixture",
      candles: input,
    },
    "test-backtest",
  );
}

// 1. Caso calculado a mano.
// Comisión: 100 bps = 1 %.
// Entrada: 1010 / (80 × 1.01) = 12.5 acciones.
// Salida: 12.5 × 130 - 1 % = 1608.75.
const result = execute(candles);

assert.equal(result.trades.length, 1);

const trade = result.trades[0];
assert.ok(trade);

assert.equal(trade.entryTime, "2026-01-08");
assert.equal(trade.exitTime, "2026-01-12");
assert.equal(trade.exitReason, "signal");

near(trade.entryPrice, 80);
near(trade.exitPrice, 130);
near(trade.quantity, 12.5);
near(trade.entryCommission, 10);
near(trade.exitCommission, 16.25);
near(trade.netPnl, 598.75);
near(trade.returnPct, (598.75 / 1010) * 100);

near(result.metrics.finalCapital, 1608.75);
near(result.metrics.totalReturnPct, (598.75 / 1010) * 100);
near(result.metrics.winRatePct, 100);
assert.equal(result.metrics.tradeCount, 1);

// Capital al cierre de cada vela:
// efectivo hasta entrar, luego acciones valoradas al cierre.
const expectedEquity = [1010, 1010, 1010, 875, 1500, 1608.75];

assert.equal(result.equityCurve.length, expectedEquity.length);

for (const [index, expected] of expectedEquity.entries()) {
  const point = result.equityCurve[index];
  assert.ok(point);
  near(point.equity, expected);
}

const expectedDrawdown = (135 / 1010) * 100;

near(result.metrics.maxDrawdownPct, expectedDrawdown);

const entryPoint = result.equityCurve[3];
assert.ok(entryPoint);
near(entryPoint.drawdownPct, expectedDrawdown);

// Benchmark:
// compra 10 acciones a 100 + 10 de comisión.
// Vende a 110: 1100 - 11 = 1089.
near(result.benchmark.finalCapital, 1089);
near(result.benchmark.totalReturnPct, (79 / 1010) * 100);
near(result.benchmark.maxDrawdownPct, (310 / 1010) * 100);

const expectedBenchmark = [1000, 900, 800, 700, 1200, 1089];

for (const [index, expected] of expectedBenchmark.entries()) {
  const point = result.benchmark.equityCurve[index];
  assert.ok(point);
  near(point.equity, expected);
}

// Mismas entradas, mismo resultado.
assert.deepEqual(execute(candles), result);

// 2. Calentamiento: las primeras dos velas no generan operaciones.
const warmup = execute(candles.slice(0, 2));

assert.equal(warmup.trades.length, 0);
near(warmup.metrics.finalCapital, 1010);
near(warmup.metrics.winRatePct, 0);
near(warmup.metrics.maxDrawdownPct, 0);

// Una señal de entrada en la última vela no se ejecuta.
const noNextCandle = execute(candles.slice(0, 3));

assert.equal(noNextCandle.trades.length, 0);
near(noNextCandle.metrics.finalCapital, 1010);

// Con cuatro velas entra en la última apertura y liquida al cierre.
// 12.5 × 70 = 875; comisión de salida = 8.75.
// Capital final = 866.25.
const forcedClose = execute(candles.slice(0, 4));

assert.equal(forcedClose.trades.length, 1);

const forcedTrade = forcedClose.trades[0];
assert.ok(forcedTrade);

assert.equal(forcedTrade.exitReason, "end-of-period");
assert.equal(forcedTrade.entryTime, "2026-01-08");
assert.equal(forcedTrade.exitTime, "2026-01-08");

near(forcedTrade.exitPrice, 70);
near(forcedTrade.exitCommission, 8.75);
near(forcedTrade.netPnl, -143.75);
near(forcedClose.metrics.finalCapital, 866.25);

const lastPoint = forcedClose.equityCurve.at(-1);
assert.ok(lastPoint);
near(lastPoint.equity, 866.25);

// 3. Anti-lookahead:
// cambiamos únicamente velas posteriores a la operación ya cerrada.
const extended = [
  ...candles,
  candle("2026-01-13", 110, 115),
  candle("2026-01-14", 115, 118),
];

const changedFuture = [
  ...candles,
  candle("2026-01-13", 200, 250),
  candle("2026-01-14", 250, 300),
];

const originalSignals = calculateRsi2Signals({
  candles: extended,
  interval: "1d",
});

const changedSignals = calculateRsi2Signals({
  candles: changedFuture,
  interval: "1d",
});

assert.deepEqual(
  originalSignals.slice(0, 6),
  changedSignals.slice(0, 6),
);

const originalRun = execute(extended);
const changedRun = execute(changedFuture);

const cutoff = "2026-01-12";

assert.deepEqual(
  originalRun.trades.filter((item) => item.exitTime <= cutoff),
  changedRun.trades.filter((item) => item.exitTime <= cutoff),
);

assert.deepEqual(
  originalRun.equityCurve.slice(0, 6),
  changedRun.equityCurve.slice(0, 6),
);

console.log("Backtest: todas las comprobaciones pasaron.");