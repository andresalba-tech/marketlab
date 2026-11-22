import type { BacktestRequest } from "../types/backtest.js";
import { filterCandlesByRange } from "./filterCandlesByRange.js";

export function parseBacktestRequest(body: unknown): BacktestRequest {
  if (typeof body !== "object" || body === null) {
    throw new Error("El cuerpo debe ser un objeto JSON.");
  }

  const allowedKeys = new Set([
    "symbol",
    "interval",
    "strategy",
    "from",
    "to",
    "initialCapital",
    "commissionBps",
  ]);

  if (Object.keys(body).some((key) => !allowedKeys.has(key))) {
    throw new Error("La solicitud contiene propiedades desconocidas.");
  }

  if (
    !("symbol" in body) ||
    typeof body.symbol !== "string" ||
    body.symbol.trim() === ""
  ) {
    throw new Error("symbol debe ser un texto no vacío.");
  }

  if (
    !("interval" in body) ||
    typeof body.interval !== "string"
  ) {
    throw new Error("interval debe ser un texto.");
  }

  if (
    !("initialCapital" in body) ||
    typeof body.initialCapital !== "number" ||
    !Number.isFinite(body.initialCapital) ||
    body.initialCapital <= 0
  ) {
    throw new Error("initialCapital debe ser finito y positivo.");
  }

  if (
    !("commissionBps" in body) ||
    typeof body.commissionBps !== "number" ||
    !Number.isFinite(body.commissionBps) ||
    body.commissionBps < 0 ||
    body.commissionBps >= 10000
  ) {
    throw new Error("commissionBps debe estar entre 0 y 10000, sin incluir 10000.");
  }

  if (
    !("strategy" in body) ||
    typeof body.strategy !== "object" ||
    body.strategy === null
  ) {
    throw new Error("strategy debe ser un objeto.");
  }

  const strategy = body.strategy;

  const allowedStrategyKeys = new Set([
    "name",
    "entryBelow",
    "exitAbove",
  ]);

  if (
    Object.keys(strategy).some(
      (key) => !allowedStrategyKeys.has(key),
    )
  ) {
    throw new Error("La estrategia contiene propiedades desconocidas.");
  }

  if (
    !("name" in strategy) ||
    strategy.name !== "rsi2" ||
    !("entryBelow" in strategy) ||
    strategy.entryBelow !== 10 ||
    !("exitAbove" in strategy) ||
    strategy.exitAbove !== 70
  ) {
    throw new Error("La estrategia disponible es RSI 2 con umbrales 10 y 70.");
  }

  const from = "from" in body ? body.from : undefined;
  const to = "to" in body ? body.to : undefined;

  if (
    (from !== undefined && typeof from !== "string") ||
    (to !== undefined && typeof to !== "string")
  ) {
    throw new Error("from y to deben ser textos.");
  }

  filterCandlesByRange([], from, to);

  return {
    symbol: body.symbol.trim().toUpperCase(),
    interval: body.interval,
    initialCapital: body.initialCapital,
    commissionBps: body.commissionBps,
    strategy: {
      name: "rsi2",
      entryBelow: 10,
      exitAbove: 70,
    },
    ...(from !== undefined ? { from } : {}),
    ...(to !== undefined ? { to } : {}),
  };
}