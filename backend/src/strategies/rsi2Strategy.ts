import rsi2 from "../indicators/rsi2.js";
import type { IndicatorInput } from "../types/indicator.js";
import type { StrategyDefinition } from "../types/backtest.js";

export const rsi2Strategy: StrategyDefinition = {
  name: "rsi2",
  entryBelow: 10,
  exitAbove: 70,
};

export type StrategySignal = {
  time: string;
  action: "enter" | "exit" | "hold";
};

export function calculateRsi2Signals(
  input: IndicatorInput,
): StrategySignal[] {
  if (!rsi2.supportedIntervals.includes(input.interval)) {
    throw new Error(
      `La estrategia RSI 2 no admite el intervalo ${input.interval}.`,
    );
  }

  const result = rsi2.calculate(input);
  const series = result.series[0];

  if (series === undefined) {
    throw new Error("El indicador RSI 2 no devolvió una serie.");
  }

  return series.points.map((point): StrategySignal => {
    if (point.value === null) {
      return {
        time: point.time,
        action: "hold",
      };
    }

    if (point.value < rsi2Strategy.entryBelow) {
      return {
        time: point.time,
        action: "enter",
      };
    }

    if (point.value > rsi2Strategy.exitAbove) {
      return {
        time: point.time,
        action: "exit",
      };
    }

    return {
      time: point.time,
      action: "hold",
    };
  });
}