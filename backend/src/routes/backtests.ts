import { Router, json } from "express";
import { randomUUID } from "node:crypto";
import type { BacktestRequest } from "../types/backtest.js";
import { fixtureMarketDataProvider } from "../providers/fixtureMarketDataProvider.js";
import { getMarketFixture } from "../services/getMarketFixture.js";
import { filterCandlesByRange } from "../services/filterCandlesByRange.js";
import { runBacktest } from "../services/runBacktest.js";
import {
  saveBacktest,
  getBacktest,
} from "../services/backtestStore.js";
import { parseBacktestRequest } from "../services/parseBacktestRequest.js";

export const backtestsRouter = Router();

backtestsRouter.post("/", json(), async (req, res) => {
  let request: BacktestRequest;

  try {
    request = parseBacktestRequest(req.body);
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

    saveBacktest(result);

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
  const result = getBacktest(req.params.id);

  if (result === undefined) {
    res.status(404).json({
      error: "Backtest no encontrado.",
    });
    return;
  }

  res.json(result);
});