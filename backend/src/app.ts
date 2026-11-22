import express from "express";
import {
  listIndicators,
  loadIndicator,
} from "./services/indicatorRegistry.js";
import { getMarketFixture } from "./services/getMarketFixture.js";
import { fixtureMarketDataProvider } from "./providers/fixtureMarketDataProvider.js";
import { filterCandlesByRange } from "./services/filterCandlesByRange.js";
import { backtestsRouter } from "./routes/backtests.js";
import { reportsRouter } from "./routes/reports.js";
import type { LlmClient } from "./types/chat.js";
import { createGeminiClient } from "./agent/geminiClient.js";
import { createChatRouter } from "./routes/chat.js";

type AppDependencies = {
  llmClient?: LlmClient;
};

export function createApp(deps: AppDependencies = {}) {
  const app = express();

  // Inicialización diferida: importar app.ts no requiere una API key.
  let client = deps.llmClient;

  const llmClient: LlmClient = {
    async complete(request) {
      client ??= createGeminiClient();
      return client.complete(request);
    },
  };

  app.use("/api/chat", createChatRouter(llmClient));

  app.use("/api/backtests", backtestsRouter);
  app.use("/api/reports", reportsRouter);

  function readDateRange(from: unknown, to: unknown) {
    if (
      (from !== undefined && typeof from !== "string") ||
      (to !== undefined && typeof to !== "string")
    ) {
      throw new Error("from y to deben ser textos.");
    }

    // Valida el formato y que from no sea posterior a to.
    filterCandlesByRange([], from, to);

    return {
      ...(from !== undefined ? { from } : {}),
      ...(to !== undefined ? { to } : {}),
    };
  }

  app.get("/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/market/:symbol", async (req, res) => {
    const symbol = req.params.symbol.toUpperCase();
    const interval = req.query.interval ?? "1d";

    let range: ReturnType<typeof readDateRange>;

    try {
      range = readDateRange(req.query.from, req.query.to);
    } catch (error) {
      res.status(400).json({
        error:
          error instanceof Error
            ? error.message
            : "Rango temporal inválido.",
      });
      return;
    }

    if (typeof interval !== "string") {
      res.status(400).json({
        error: "El intervalo debe ser un texto.",
      });
      return;
    }

    const fixture = getMarketFixture(interval);

    if (fixture === null) {
      res.status(400).json({
        error: "Los intervalos disponibles son 1d y 5m.",
      });
      return;
    }

    if (getMarketFixture(interval, symbol) === null) {
      res.status(404).json({
        error: "La demo solo tiene datos de MSFT y AAPL.",
      });
      return;
    }

    try {
      const market = await fixtureMarketDataProvider.getMarket({
        symbol,
        interval,
        ...range,
      });

      res.json(market);
    } catch (error) {
      console.error("No se pudieron obtener los precios:", error);

      res.status(500).json({
        error: "No se pudieron obtener los precios.",
      });
    }
  });

  app.get("/api/indicators", async (req, res) => {
    try {
      const interval = req.query.interval;

      if (
        interval !== undefined &&
        typeof interval !== "string"
      ) {
        res.status(400).json({
          error: "El intervalo debe ser un texto.",
        });
        return;
      }

      if (
        interval !== undefined &&
        getMarketFixture(interval) === null
      ) {
        res.status(400).json({
          error: "Los intervalos disponibles son 1d y 5m.",
        });
        return;
      }

      const names = await listIndicators();

      if (interval === undefined) {
        res.json({ indicators: names });
        return;
      }

      const compatibleNames: string[] = [];

      for (const name of names) {
        const indicator = await loadIndicator(name);

        if (indicator?.supportedIntervals.includes(interval)) {
          compatibleNames.push(name);
        }
      }

      res.json({
        indicators: compatibleNames,
      });
    } catch (error) {
      console.error("No se pudieron listar los indicadores:", error);

      res.status(500).json({
        error: "No se pudieron listar los indicadores.",
      });
    }
  });

  app.get("/api/indicators/:name", async (req, res) => {
    try {
      const name = req.params.name;
      const indicator = await loadIndicator(name);

      if (indicator === null) {
        res.status(404).json({
          error: "Indicador no encontrado",
        });
        return;
      }

      res.json({
        name,
        description: indicator.description,
        supportedIntervals: indicator.supportedIntervals,
      });
    } catch (error) {
      console.error("No se pudo cargar el indicador:", error);

      res.status(500).json({
        error: "No se pudo cargar el indicador",
      });
    }
  });

  app.get("/api/market/:symbol/indicators/:name", async (req, res) => {
    try {
      const symbol = req.params.symbol.toUpperCase();
      const name = req.params.name;
      const interval = req.query.interval ?? "1d";

      let range: ReturnType<typeof readDateRange>;

      try {
        range = readDateRange(req.query.from, req.query.to);
      } catch (error) {
        res.status(400).json({
          error:
            error instanceof Error
              ? error.message
              : "Rango temporal inválido.",
        });
        return;
      }

      if (typeof interval !== "string") {
        res.status(400).json({
          error: "El intervalo debe ser un texto.",
        });
        return;
      }

      const fixture = getMarketFixture(interval);

      if (fixture === null) {
        res.status(400).json({
          error: "Los intervalos disponibles son 1d y 5m.",
        });
        return;
      }

      if (getMarketFixture(interval, symbol) === null) {
        res.status(404).json({
          error: "La demo solo tiene datos de MSFT y AAPL.",
        });
        return;
      }

      const indicator = await loadIndicator(name);

      if (indicator === null) {
        res.status(404).json({
          error: "Indicador no encontrado.",
        });
        return;
      }

      if (!indicator.supportedIntervals.includes(fixture.interval)) {
        res.status(400).json({
          error: `El indicador ${name} no admite el intervalo ${fixture.interval}.`,
          supportedIntervals: indicator.supportedIntervals,
        });
        return;
      }

      // Obtenemos todo el historial para calcular correctamente.
      const market = await fixtureMarketDataProvider.getMarket({
        symbol,
        interval,
      });

      const result = indicator.calculate({
        candles: market.candles,
        interval: market.interval,
      });

      // Después seleccionamos las fechas que pidió el usuario.
      const visibleCandles = filterCandlesByRange(
        market.candles,
        range.from,
        range.to,
      );

      const visibleTimes = new Set(
        visibleCandles.map((candle) => candle.time),
      );

      const series = result.series.map((series) => ({
        ...series,
        points: series.points.filter((point) =>
          visibleTimes.has(point.time),
        ),
      }));

      res.json({
        symbol: market.symbol,
        interval: market.interval,
        source: market.source,
        indicator: name,
        ...result,
        series,
      });
    } catch (error) {
      console.error("No se pudo calcular el indicador:", error);

      res.status(500).json({
        error: "No se pudo calcular el indicador.",
      });
    }
  });

  return app;
}

// Conserva la compatibilidad con las pruebas actuales.
export const app = createApp();