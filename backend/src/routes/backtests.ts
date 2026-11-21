import { Router, json } from "express";
import { randomUUID } from "node:crypto";
import type {
  BacktestRequest,
  BacktestResult,
} from "../types/backtest.js";
import { fixtureMarketDataProvider } from "../providers/fixtureMarketDataProvider.js";
import { getMarketFixture } from "../services/getMarketFixture.js";
import { filterCandlesByRange } from "../services/filterCandlesByRange.js";
import { runBacktest } from "../services/runBacktest.js";

export const backtestsRouter = Router();

const results = new Map<string, BacktestResult>();

function parseRequest(body: unknown): BacktestRequest {
  if (typeof body !== "object" || body === null) {
    throw new Error("El cuerpo debe ser un objeto JSON.");
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

backtestsRouter.post("/", json(), async (req, res) => {
  let request: BacktestRequest;

  try {
    request = parseRequest(req.body);
  } catch (error) {
    res.status(400).json({
      error:
        error instanceof Error
          ? error.message
          : "Solicitud inválida.",
    });
    return;
  }

  if (getMarketFixture(request.interval) === null) {
    res.status(400).json({
      error: "Los intervalos disponibles son 1d y 5m.",
    });
    return;
  }

  if (getMarketFixture(request.interval, request.symbol) === null) {
    res.status(404).json({
      error: "La demo solo tiene datos de MSFT y AAPL.",
    });
    return;
  }

  try {
    // Sin from/to: el motor necesita el historial de calentamiento.
    const market = await fixtureMarketDataProvider.getMarket({
      symbol: request.symbol,
      interval: request.interval,
    });

    const window = filterCandlesByRange(
      market.candles,
      request.from,
      request.to,
    );

    if (window.length === 0) {
      res.status(400).json({
        error: "No hay velas en el rango solicitado.",
      });
      return;
    }

    const result = runBacktest(request, market, randomUUID());

    results.set(result.id, result);

    res
      .status(201)
      .location(`/api/backtests/${result.id}`)
      .json(result);
  } catch (error) {
    console.error("No se pudo ejecutar el backtest:", error);

    res.status(500).json({
      error: "No se pudo ejecutar el backtest.",
    });
  }
});

backtestsRouter.get("/:id", (req, res) => {
  const result = results.get(req.params.id);

  if (result === undefined) {
    res.status(404).json({
      error: "Backtest no encontrado.",
    });
    return;
  }

  res.json(result);
});