import type {
  BacktestRequest,
  BacktestResult,
  BacktestTrade,
  EquityPoint,
} from "../types/backtest.js";
import type { MarketData } from "../types/market.js";
import { calculateRsi2Signals } from "../strategies/rsi2Strategy.js";
import { normalizeCandles } from "./normalizeCandles.js";
import { filterCandlesByRange } from "./filterCandlesByRange.js";

type Position = {
  entryTime: string;
  entryPrice: number;
  quantity: number;
  entryCommission: number;
  investedCapital: number;
};

export function runBacktest(
  request: BacktestRequest,
  market: MarketData,
  id: string,
): BacktestResult {
  const { initialCapital, commissionBps, strategy } = request;

  if (!Number.isFinite(initialCapital) || initialCapital <= 0) {
    throw new Error("El capital inicial debe ser finito y positivo.");
  }

  if (
    !Number.isFinite(commissionBps) ||
    commissionBps < 0 ||
    commissionBps >= 10000
  ) {
    throw new Error("La comisión debe estar entre 0 y 10000 bps, sin incluir 10000.");
  }

  if (
    strategy.name !== "rsi2" ||
    strategy.entryBelow !== 10 ||
    strategy.exitAbove !== 70
  ) {
    throw new Error("La estrategia disponible es RSI 2 con umbrales 10 y 70.");
  }

  if (
    request.symbol !== market.symbol ||
    request.interval !== market.interval
  ) {
    throw new Error("Los datos no corresponden al símbolo e intervalo solicitados.");
  }

  const history = normalizeCandles(market.candles);

  if (
    history.some((candle) =>
      [candle.open, candle.high, candle.low, candle.close].some(
        (price) => price <= 0,
      ),
    )
  ) {
    throw new Error("El backtest requiere precios positivos.");
  }

  // El RSI utiliza todo el historial disponible.
  const signals = calculateRsi2Signals({
    candles: history,
    interval: market.interval,
  });

  const signalByTime = new Map(
    signals.map((signal) => [signal.time, signal.action]),
  );

  // Solo operamos dentro del rango solicitado.
  const candles = filterCandlesByRange(
    history,
    request.from,
    request.to,
  );

  const firstCandle = candles[0];

  if (firstCandle === undefined) {
    throw new Error("No hay velas en el rango solicitado.");
  }

  const commissionRate = commissionBps / 10000;

  let cash = initialCapital;
  let position: Position | null = null;
  let peak = initialCapital;

  const trades: BacktestTrade[] = [];
  const equityCurve: EquityPoint[] = [];

  function closePosition(
    time: string,
    price: number,
    exitReason: BacktestTrade["exitReason"],
  ): void {
    if (position === null) return;

    const grossProceeds = position.quantity * price;
    const exitCommission = grossProceeds * commissionRate;
    const netProceeds = grossProceeds - exitCommission;
    const netPnl = netProceeds - position.investedCapital;

    cash += netProceeds;

    trades.push({
      entryTime: position.entryTime,
      entryPrice: position.entryPrice,
      exitTime: time,
      exitPrice: price,
      quantity: position.quantity,
      entryCommission: position.entryCommission,
      exitCommission,
      netPnl,
      returnPct: (netPnl / position.investedCapital) * 100,
      exitReason,
    });

    position = null;
  }

  // Benchmark: compra en la primera apertura, incluida la comisión.
  const benchmarkQuantity =
    initialCapital / (firstCandle.open * (1 + commissionRate));

  let benchmarkPeak = initialCapital;
  let benchmarkFinalCapital = initialCapital;
  const benchmarkCurve: EquityPoint[] = [];

  for (const [index, candle] of candles.entries()) {
    const previousCandle = candles[index - 1];

    // La primera vela del rango no ejecuta señales anteriores al rango.
    const previousSignal =
      previousCandle === undefined
        ? "hold"
        : signalByTime.get(previousCandle.time) ?? "hold";

    // Ejecutamos la señal del cierre anterior en la apertura actual.
    if (previousSignal === "enter" && position === null) {
      const investedCapital = cash;
      const quantity =
        investedCapital / (candle.open * (1 + commissionRate));

      const entryCommission =
        quantity * candle.open * commissionRate;

      position = {
        entryTime: candle.time,
        entryPrice: candle.open,
        quantity,
        entryCommission,
        investedCapital,
      };

      cash = 0;
    } else if (previousSignal === "exit" && position !== null) {
      closePosition(candle.time, candle.open, "signal");
    }

    const isLastCandle = index === candles.length - 1;

    // Política fija: cerrar cualquier posición restante al último cierre.
    if (isLastCandle) {
      closePosition(candle.time, candle.close, "end-of-period");
    }

    const equity =
      cash + (position === null ? 0 : position.quantity * candle.close);

    peak = Math.max(peak, equity);

    equityCurve.push({
      time: candle.time,
      equity,
      drawdownPct: ((peak - equity) / peak) * 100,
    });

    // El benchmark se valora al cierre y paga la salida al final.
    const benchmarkEquity =
      benchmarkQuantity *
      candle.close *
      (isLastCandle ? 1 - commissionRate : 1);

    benchmarkPeak = Math.max(benchmarkPeak, benchmarkEquity);
    benchmarkFinalCapital = benchmarkEquity;

    benchmarkCurve.push({
      time: candle.time,
      equity: benchmarkEquity,
      drawdownPct:
        ((benchmarkPeak - benchmarkEquity) / benchmarkPeak) * 100,
    });
  }

  const winningTrades = trades.filter((trade) => trade.netPnl > 0).length;

  const maxDrawdown = (curve: EquityPoint[]) =>
    curve.reduce(
      (maximum, point) => Math.max(maximum, point.drawdownPct),
      0,
    );

  return {
    id,
    request: {
      ...request,
      strategy: { ...request.strategy },
    },
    source: market.source,
    assumptions: {
      direction: "long-only",
      allocation: "all-available-cash",
      fractionalShares: true,
      leverage: false,
      signalTiming: "candle-close",
      executionTiming: "next-candle-open",
      warmup: "use-prior-history-no-trading",
      firstSignal: "first-candle-in-window",
      finalPosition: "close-at-last-candle-close",
      commissionBps,
      commissionCharged: "entry-and-exit",
      slippageBps: 0,
      benchmark: "buy-first-open-sell-last-close",
    },
    metrics: {
      finalCapital: cash,
      totalReturnPct: (cash / initialCapital - 1) * 100,
      maxDrawdownPct: maxDrawdown(equityCurve),
      tradeCount: trades.length,
      winRatePct:
        trades.length === 0
          ? 0
          : (winningTrades / trades.length) * 100,
    },
    equityCurve,
    trades,
    benchmark: {
      name: "buy-and-hold",
      finalCapital: benchmarkFinalCapital,
      totalReturnPct:
        (benchmarkFinalCapital / initialCapital - 1) * 100,
      maxDrawdownPct: maxDrawdown(benchmarkCurve),
      equityCurve: benchmarkCurve,
    },
  };
}