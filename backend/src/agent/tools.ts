import type { ToolDefinition } from "../types/chat.js";
import { fixtureMarketDataProvider } from "../providers/fixtureMarketDataProvider.js";
import { loadIndicator } from "../services/indicatorRegistry.js";
import { filterCandlesByRange } from "../services/filterCandlesByRange.js";
import { randomUUID } from "node:crypto";
import { parseBacktestRequest } from "../services/parseBacktestRequest.js";
import { runBacktest as executeBacktest } from "../services/runBacktest.js";
import {
  saveBacktest,
  getBacktest,
} from "../services/backtestStore.js";
import { saveReport } from "../services/reportStore.js";

export const calculateIndicatorsDefinition: ToolDefinition = {
  name: "calculateIndicators",
  description:
    "Calcula un indicador sobre datos simulados de MSFT o AAPL. " +
    "Devuelve el último punto y hasta cinco puntos recientes por serie. " +
    "Las fechas from y to son opcionales, inclusivas y en UTC.",
  parameters: {
    type: "object",
    properties: {
      symbol: {
        type: "string",
        enum: ["MSFT", "AAPL"],
      },
      interval: {
        type: "string",
        enum: ["1d", "5m"],
      },
      indicator: {
        type: "string",
        description: "Nombre del archivo del indicador, sin extensión.",
      },
      from: {
        type: "string",
        description: "Fecha inicial YYYY-MM-DD.",
      },
      to: {
        type: "string",
        description: "Fecha final YYYY-MM-DD.",
      },
    },
    required: ["symbol", "interval", "indicator"],
    additionalProperties: false,
  },
};

function parseIndicatorArgs(value: unknown) {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error("Los argumentos deben ser un objeto.");
  }

  const allowedKeys = new Set([
    "symbol",
    "interval",
    "indicator",
    "from",
    "to",
  ]);

  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    throw new Error("Los argumentos contienen propiedades desconocidas.");
  }

  if (
    !("symbol" in value) ||
    (value.symbol !== "MSFT" && value.symbol !== "AAPL")
  ) {
    throw new Error("symbol debe ser MSFT o AAPL.");
  }

  if (
    !("interval" in value) ||
    (value.interval !== "1d" && value.interval !== "5m")
  ) {
    throw new Error("interval debe ser 1d o 5m.");
  }

  if (
    !("indicator" in value) ||
    typeof value.indicator !== "string" ||
    value.indicator.trim() === ""
  ) {
    throw new Error("indicator debe ser un texto no vacío.");
  }

  const from = "from" in value ? value.from : undefined;
  const to = "to" in value ? value.to : undefined;

  if (
    (from !== undefined && typeof from !== "string") ||
    (to !== undefined && typeof to !== "string")
  ) {
    throw new Error("from y to deben ser textos.");
  }

  filterCandlesByRange([], from, to);

  return {
    symbol: value.symbol,
    interval: value.interval,
    indicator: value.indicator,
    ...(from !== undefined ? { from } : {}),
    ...(to !== undefined ? { to } : {}),
  };
}

export async function calculateIndicators(args: unknown) {
  const input = parseIndicatorArgs(args);

  const indicator = await loadIndicator(input.indicator);

  if (indicator === null) {
    throw new Error(`Indicador no encontrado: ${input.indicator}`);
  }

  if (!indicator.supportedIntervals.includes(input.interval)) {
    throw new Error(
      `El indicador ${input.indicator} no admite ${input.interval}.`,
    );
  }

  // Conservamos el historial necesario para el calentamiento.
  const market = await fixtureMarketDataProvider.getMarket({
    symbol: input.symbol,
    interval: input.interval,
  });

  const visibleCandles = filterCandlesByRange(
    market.candles,
    input.from,
    input.to,
  );

  if (visibleCandles.length === 0) {
    throw new Error("No hay datos en el rango solicitado.");
  }

  const result = indicator.calculate({
    candles: market.candles,
    interval: market.interval,
  });

  const visibleTimes = new Set(
    visibleCandles.map((candle) => candle.time),
  );

  return {
    symbol: market.symbol,
    interval: market.interval,
    source: market.source,
    indicator: input.indicator,
    series: result.series.map((series) => {
      const points = series.points.filter((point) =>
        visibleTimes.has(point.time),
      );

      return {
        name: series.name,
        totalPoints: points.length,
        calculatedPoints: points.filter(
          (point) => point.value !== null,
        ).length,
        latest: points.at(-1) ?? null,
        recentPoints: points.slice(-5),
      };
    }),
  };
}

export const runBacktestDefinition: ToolDefinition = {
  name: "runBacktest",
  description:
    "Ejecuta la estrategia RSI 2 sobre datos simulados. " +
    "Compra cuando RSI 2 < 10 y vende cuando RSI 2 > 70, " +
    "ejecutando en la siguiente apertura. " +
    "Guarda el resultado y devuelve su ID, métricas y benchmark.",
  parameters: {
    type: "object",
    properties: {
      symbol: {
        type: "string",
        enum: ["MSFT", "AAPL"],
      },
      interval: {
        type: "string",
        enum: ["1d", "5m"],
      },
      strategy: {
        type: "object",
        properties: {
          name: {
            type: "string",
            enum: ["rsi2"],
          },
          entryBelow: {
            type: "number",
            enum: [10],
          },
          exitAbove: {
            type: "number",
            enum: [70],
          },
        },
        required: ["name", "entryBelow", "exitAbove"],
        additionalProperties: false,
      },
      initialCapital: {
        type: "number",
        description: "Capital inicial, finito y mayor que cero.",
      },
      commissionBps: {
        type: "number",
        description:
          "Comisión por entrada y salida: desde 0 hasta menos de 10000 bps.",
      },
      from: {
        type: "string",
        description: "Fecha inicial inclusiva YYYY-MM-DD, en UTC.",
      },
      to: {
        type: "string",
        description: "Fecha final inclusiva YYYY-MM-DD, en UTC.",
      },
    },
    required: [
      "symbol",
      "interval",
      "strategy",
      "initialCapital",
      "commissionBps",
    ],
    additionalProperties: false,
  },
};

export async function runBacktestTool(args: unknown) {
  const request = parseBacktestRequest(args);

  // Obtenemos todo el historial para conservar el calentamiento.
  const market = await fixtureMarketDataProvider.getMarket({
    symbol: request.symbol,
    interval: request.interval,
  });

  const result = executeBacktest(request, market, randomUUID());

  saveBacktest(result);

  // El resultado completo queda guardado.
  // Al modelo enviamos únicamente el resumen.
  return {
    backtestId: result.id,
    request: result.request,
    source: result.source,
    assumptions: result.assumptions,
    metrics: result.metrics,
    benchmark: {
      name: result.benchmark.name,
      finalCapital: result.benchmark.finalCapital,
      totalReturnPct: result.benchmark.totalReturnPct,
      maxDrawdownPct: result.benchmark.maxDrawdownPct,
    },
  };
}

export const compareStrategiesDefinition: ToolDefinition = {
  name: "compareStrategies",
  description:
    "Compara dos backtests de RSI 2 sobre datos simulados. " +
    "Permite comparar símbolos, rangos, capitales o comisiones. " +
    "Devuelve las métricas y el benchmark de cada corrida.",
  parameters: {
    type: "object",
    properties: {
      first: runBacktestDefinition.parameters,
      second: runBacktestDefinition.parameters,
    },
    required: ["first", "second"],
    additionalProperties: false,
  },
};

export async function compareStrategies(args: unknown) {
  if (
    typeof args !== "object" ||
    args === null ||
    Array.isArray(args)
  ) {
    throw new Error("Los argumentos deben ser un objeto.");
  }

  if (
    Object.keys(args).some(
      (key) => key !== "first" && key !== "second",
    )
  ) {
    throw new Error("La comparación contiene propiedades desconocidas.");
  }

  if (!("first" in args) || !("second" in args)) {
    throw new Error("La comparación requiere first y second.");
  }

  // Validamos ambas solicitudes antes de ejecutar la primera.
  const firstRequest = parseBacktestRequest(args.first);
  const secondRequest = parseBacktestRequest(args.second);

  const first = await runBacktestTool(firstRequest);
  const second = await runBacktestTool(secondRequest);

  return {
    first,
    second,
    difference: {
      totalReturnPercentagePoints:
        first.metrics.totalReturnPct -
        second.metrics.totalReturnPct,
      maxDrawdownPercentagePoints:
        first.metrics.maxDrawdownPct -
        second.metrics.maxDrawdownPct,
    },
  };
}

export const generateReportDefinition: ToolDefinition = {
  name: "generateReport",
  description:
    "Genera un CSV de las operaciones de un backtest ya guardado. " +
    "Requiere su backtestId y devuelve un enlace de descarga.",
  parameters: {
    type: "object",
    properties: {
      backtestId: {
        type: "string",
      },
    },
    required: ["backtestId"],
    additionalProperties: false,
  },
};

function csvCell(value: string | number): string {
  const text = String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export async function generateReport(args: unknown) {
  if (
    typeof args !== "object" ||
    args === null ||
    Array.isArray(args)
  ) {
    throw new Error("Los argumentos deben ser un objeto.");
  }

  if (Object.keys(args).some((key) => key !== "backtestId")) {
    throw new Error("El reporte contiene propiedades desconocidas.");
  }

  if (
    !("backtestId" in args) ||
    typeof args.backtestId !== "string" ||
    args.backtestId.trim() === ""
  ) {
    throw new Error("backtestId debe ser un texto no vacío.");
  }

  const backtest = getBacktest(args.backtestId);

  if (backtest === undefined) {
    throw new Error("Backtest no encontrado.");
  }

  const header = [
    "entryTime",
    "entryPrice",
    "exitTime",
    "exitPrice",
    "quantity",
    "entryCommission",
    "exitCommission",
    "netPnl",
    "returnPct",
    "exitReason",
  ];

  const rows = backtest.trades.map((trade) => [
    trade.entryTime,
    trade.entryPrice,
    trade.exitTime,
    trade.exitPrice,
    trade.quantity,
    trade.entryCommission,
    trade.exitCommission,
    trade.netPnl,
    trade.returnPct,
    trade.exitReason,
  ]);

  const content =
    "\uFEFF" +
    [header, ...rows]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n") +
    "\r\n";

  const reportId = randomUUID();
  const filename = `backtest-${backtest.id}.csv`;

  saveReport({
    id: reportId,
    filename,
    content,
  });

  return {
    reportId,
    backtestId: backtest.id,
    filename,
    downloadUrl: `/api/reports/${reportId}/download`,
    mimeType: "text/csv",
    tradeCount: backtest.trades.length,
  };
}

