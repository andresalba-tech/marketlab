import express from "express";
import {
  listIndicators,
  loadIndicator,
} from "./services/indicatorRegistry.js";
import { marketFixture } from "./data/marketFixture.js";
import { getMarketFixture } from "./services/getMarketFixture.js";

const app = express();

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/market/:symbol", (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const interval = req.query.interval ?? "1d";

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

  if (symbol !== fixture.symbol) {
    res.status(404).json({
      error: "La demo solo tiene datos de MSFT.",
    });
    return;
  }

  res.json({
    symbol,
    interval: fixture.interval,
    source: fixture.source,
    candles: fixture.candles,
  });
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

    if (symbol !== fixture.symbol) {
      res.status(404).json({
        error: "La demo solo tiene datos de MSFT.",
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

    const result = indicator.calculate({
      candles: fixture.candles,
      interval: fixture.interval,
    });

    res.json({
      symbol,
      interval: fixture.interval,
      source: fixture.source,
      indicator: name,
      ...result,
    });
  } catch (error) {
    console.error("No se pudo calcular el indicador:", error);

    res.status(500).json({
      error: "No se pudo calcular el indicador.",
    });
  }
});

app.listen(3000, () => {
  console.log("Servidor disponible en http://localhost:3000");
});