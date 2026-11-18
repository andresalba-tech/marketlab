import express from "express";
import {
  listIndicators,
  loadIndicator,
} from "./services/indicatorRegistry.js";
import { marketFixture } from "./data/marketFixture.js";

const app = express();

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/market/:symbol", (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const interval = req.query.interval ?? "1d";

  if (interval !== "1d") {
    res.status(400).json({
      error: "La demo solo admite el intervalo 1d",
    });
    return;
  }

  if (symbol !== "MSFT") {
    res.status(404).json({
      error: "La demo solo tiene datos de MSFT",
    });
    return;
  }

  const candles = marketFixture.candles;

  res.json({
    symbol,
    interval,
    source: "fixture",
    candles,
  });
});

app.get("/api/indicators", async (req, res) => {
  try {
    const indicators = await listIndicators();

    res.json({ indicators });
  } catch (error) {
    console.error("No se pudo leer la carpeta de indicadores:", error);

    res.status(500).json({
      error: "No se pudieron listar los indicadores",
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

    if (symbol !== marketFixture.symbol) {
      res.status(404).json({
        error: "La demo solo tiene datos de MSFT",
      });
      return;
    }

    const indicator = await loadIndicator(name);

    if (indicator === null) {
      res.status(404).json({
        error: "Indicador no encontrado",
      });
      return;
    }

    const result = indicator.calculate({
      candles: marketFixture.candles,
    });

    res.json({
      symbol,
      interval: marketFixture.interval,
      source: marketFixture.source,
      indicator: name,
      ...result,
    });
  } catch (error) {
    console.error("No se pudo calcular el indicador:", error);

    res.status(500).json({
      error: "No se pudo calcular el indicador",
    });
  }
});

app.listen(3000, () => {
  console.log("Servidor disponible en http://localhost:3000");
});