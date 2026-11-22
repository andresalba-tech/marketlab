import assert from "node:assert/strict";
import {
  calculateIndicators,
  runBacktestTool,
  compareStrategies,
  generateReport,
} from "../agent/tools.js";
import { fixtureMarketDataProvider } from "../providers/fixtureMarketDataProvider.js";
import { loadIndicator } from "../services/indicatorRegistry.js";
import { getBacktest } from "../services/backtestStore.js";
import { getReport } from "../services/reportStore.js";
import { runAgentTurn } from "../agent/runAgentTurn.js";
import type { LlmClient } from "../types/chat.js";
import type { RegisteredTool } from "../agent/toolRegistry.js";
import { buildToolBlocks } from "../agent/buildToolBlocks.js";

// Ejecutar la herramienta.
const result = await calculateIndicators({
  symbol: "MSFT",
  interval: "1d",
  indicator: "rsi2",
});

assert.equal(result.symbol, "MSFT");
assert.equal(result.interval, "1d");
assert.equal(result.source, "fixture");
assert.equal(result.indicator, "rsi2");

// Comparar su resultado con el cálculo directo del backend.
const market = await fixtureMarketDataProvider.getMarket({
  symbol: "MSFT",
  interval: "1d",
});

const indicator = await loadIndicator("rsi2");
assert.ok(indicator);

const directResult = indicator.calculate({
  candles: market.candles,
  interval: market.interval,
});

const directSeries = directResult.series[0];
const toolSeries = result.series[0];

assert.ok(directSeries);
assert.ok(toolSeries);

assert.equal(toolSeries.totalPoints, directSeries.points.length);
assert.deepEqual(
  toolSeries.latest,
  directSeries.points.at(-1) ?? null,
);
assert.deepEqual(
  toolSeries.recentPoints,
  directSeries.points.slice(-5),
);

// Rechazar propiedades que la herramienta no admite.
await assert.rejects(
  () =>
    calculateIndicators({
      symbol: "MSFT",
      interval: "1d",
      indicator: "rsi2",
      unexpected: true,
    }),
  /propiedades desconocidas/,
);

// Rechazar un indicador incompatible con el intervalo.
await assert.rejects(
  () =>
    calculateIndicators({
      symbol: "MSFT",
      interval: "1d",
      indicator: "vwap",
    }),
  /no admite/,
);

const backtest = await runBacktestTool({
  symbol: "MSFT",
  interval: "1d",
  strategy: {
    name: "rsi2",
    entryBelow: 10,
    exitAbove: 70,
  },
  initialCapital: 10000,
  commissionBps: 10,
});

const storedBacktest = getBacktest(backtest.backtestId);

assert.ok(storedBacktest);
assert.equal(storedBacktest.request.symbol, "MSFT");
assert.deepEqual(backtest.metrics, storedBacktest.metrics);
assert.equal(backtest.metrics.tradeCount, 4);

assert.ok(
  Math.abs(backtest.metrics.finalCapital - 7801.892554646159) < 1e-6,
);

const comparisonRequest = {
  symbol: "MSFT",
  interval: "1d",
  strategy: {
    name: "rsi2",
    entryBelow: 10,
    exitAbove: 70,
  },
  initialCapital: 10000,
  commissionBps: 0,
};

const comparison = await compareStrategies({
  first: comparisonRequest,
  second: {
    ...comparisonRequest,
    commissionBps: 10,
  },
});

assert.ok(getBacktest(comparison.first.backtestId));
assert.ok(getBacktest(comparison.second.backtestId));

assert.ok(
  comparison.first.metrics.finalCapital >
    comparison.second.metrics.finalCapital,
  "Con las mismas operaciones, cobrar comisión debe reducir el capital final.",
);

assert.equal(
  comparison.difference.totalReturnPercentagePoints,
  comparison.first.metrics.totalReturnPct -
    comparison.second.metrics.totalReturnPct,
);

const report = await generateReport({
  backtestId: backtest.backtestId,
});

const storedReport = getReport(report.reportId);

assert.ok(storedReport);
assert.equal(report.tradeCount, storedBacktest.trades.length);
assert.equal(report.filename, storedReport.filename);
assert.equal(
  report.downloadUrl,
  `/api/reports/${report.reportId}/download`,
);

const csvLines = storedReport.content
  .replace(/^\uFEFF/, "")
  .trimEnd()
  .split("\r\n");

assert.equal(csvLines.length, storedBacktest.trades.length + 1);
assert.ok(csvLines[0]?.includes('"netPnl"'));

const firstTrade = storedBacktest.trades[0];
assert.ok(firstTrade);
assert.ok(
  csvLines[1]?.includes(`"${firstTrade.netPnl}"`),
);

await assert.rejects(
  () => generateReport({ backtestId: "no-existe" }),
  /Backtest no encontrado/,
);

// 1. Ciclo completo con cliente falso y herramientas reales.
let completionCount = 0;

const mockClient: LlmClient = {
  async complete(request) {
    completionCount += 1;

    if (completionCount === 1) {
      return {
        text: "",
        toolCalls: [
          {
            id: "indicator-call",
            name: "calculateIndicators",
            arguments: {
              symbol: "MSFT",
              interval: "1d",
              indicator: "rsi2",
            },
          },
          {
            id: "backtest-call",
            name: "runBacktest",
            arguments: {
              symbol: "MSFT",
              interval: "1d",
              strategy: {
                name: "rsi2",
                entryBelow: 10,
                exitAbove: 70,
              },
              initialCapital: 10000,
              commissionBps: 10,
            },
          },
        ],
      };
    }

    const indicatorReply = request.messages.find(
      (message) =>
        message.role === "tool" &&
        message.toolCallId === "indicator-call",
    );

    assert.ok(indicatorReply?.role === "tool");
    assert.ok(indicatorReply.result.ok);

    // Comparación contra el resultado real calculado antes en este archivo.
    assert.deepEqual(indicatorReply.result.data, result);

    const backtestReply = request.messages.find(
      (message) =>
        message.role === "tool" &&
        message.toolCallId === "backtest-call",
    );

    assert.ok(backtestReply?.role === "tool");
    assert.ok(backtestReply.result.ok);

    const payload = backtestReply.result.data;

    assert.ok(
      typeof payload === "object" &&
        payload !== null &&
        "metrics" in payload,
    );

    assert.deepEqual(payload.metrics, backtest.metrics);

    return {
      text: "El backtest de datos simulados cerró 4 operaciones.",
      toolCalls: [],
    };
  },
};

const originalHistory = [
  {
    role: "user" as const,
    text: "Calcula RSI 2 y ejecuta su backtest para MSFT diario.",
  },
];

const completedTurn = await runAgentTurn({
  llmClient: mockClient,
  history: originalHistory,
});

assert.equal(completionCount, 2);
assert.equal(completedTurn.message.status, "completed");
assert.equal(completedTurn.message.toolTraces.length, 2);
assert.ok(
  completedTurn.message.toolTraces.every((trace) => trace.ok),
);
assert.deepEqual(
  completedTurn.message.blocks.filter(
    (block) => block.type === "markdown",
  ),
  [
    {
      type: "markdown",
      text: "El backtest de datos simulados cerró 4 operaciones.",
    },
  ],
);

const resultTable = completedTurn.message.blocks.find(
  (block) => block.type === "table",
);

assert.ok(resultTable?.type === "table");

assert.deepEqual(resultTable.rows[0], [
  "Capital final",
  backtest.metrics.finalCapital,
  backtest.benchmark.finalCapital,
]);

// El orquestador no modifica el historial recibido.
assert.equal(originalHistory.length, 1);

// 2. Argumentos inválidos: el error vuelve al modelo.
let invalidCount = 0;

const invalidClient: LlmClient = {
  async complete(request) {
    invalidCount += 1;

    if (invalidCount === 1) {
      return {
        text: "",
        toolCalls: [
          {
            id: "invalid-call",
            name: "calculateIndicators",
            arguments: {
              symbol: "MSFT",
              interval: "1d",
              // Falta indicator.
            },
          },
        ],
      };
    }

    const reply = request.messages.at(-1);

    assert.ok(reply?.role === "tool");
    assert.equal(reply.result.ok, false);

    if (!reply.result.ok) {
      assert.equal(reply.result.error.code, "TOOL_ERROR");
    }

    return {
      text: "No se pudo calcular el indicador: faltan argumentos.",
      toolCalls: [],
    };
  },
};

const invalidTurn = await runAgentTurn({
  llmClient: invalidClient,
  history: [],
});

assert.equal(invalidCount, 2);
assert.equal(invalidTurn.message.status, "completed");
assert.equal(invalidTurn.message.toolTraces[0]?.ok, false);
assert.equal(
  invalidTurn.message.toolTraces[0]?.error?.code,
  "TOOL_ERROR",
);

// 3. Timeout de una herramienta que nunca termina.
const slowTools = new Map<string, RegisteredTool>([
  [
    "slowTool",
    {
      definition: {
        name: "slowTool",
        description: "Herramienta falsa para probar el timeout.",
        parameters: {
          type: "object",
          properties: {},
        },
      },
      execute: () => new Promise<never>(() => {}),
    },
  ],
]);

let timeoutCount = 0;

const timeoutClient: LlmClient = {
  async complete(request) {
    timeoutCount += 1;

    if (timeoutCount === 1) {
      return {
        text: "",
        toolCalls: [
          {
            id: "slow-call",
            name: "slowTool",
            arguments: {},
          },
        ],
      };
    }

    const reply = request.messages.at(-1);

    assert.ok(reply?.role === "tool");
    assert.ok(!reply.result.ok);
    assert.equal(reply.result.error.code, "TOOL_TIMEOUT");

    return {
      text: "La herramienta excedió el tiempo permitido.",
      toolCalls: [],
    };
  },
};

const timeoutTurn = await runAgentTurn({
  llmClient: timeoutClient,
  history: [],
  tools: slowTools,
  toolTimeoutMs: 20,
});

assert.equal(timeoutCount, 2);
assert.equal(
  timeoutTurn.message.toolTraces[0]?.error?.code,
  "TOOL_TIMEOUT",
);

// 4. Un modelo que insiste en llamar herramientas queda limitado.
let executedCalls = 0;
let loopCompletions = 0;

const countingTools = new Map<string, RegisteredTool>([
  [
    "counter",
    {
      definition: {
        name: "counter",
        description: "Cuenta ejecuciones en esta prueba.",
        parameters: {
          type: "object",
          properties: {},
        },
      },
      async execute() {
        executedCalls += 1;
        return { count: executedCalls };
      },
    },
  ],
]);

const loopingClient: LlmClient = {
  async complete() {
    loopCompletions += 1;

    return {
      text: "",
      toolCalls: [
        {
          id: `loop-${loopCompletions}`,
          name: "counter",
          arguments: {},
        },
      ],
    };
  },
};

const limitedTurn = await runAgentTurn({
  llmClient: loopingClient,
  history: [],
  tools: countingTools,
  maxToolCalls: 5,
});

assert.equal(executedCalls, 5);
assert.equal(loopCompletions, 6);
assert.equal(limitedTurn.message.toolTraces.length, 5);
assert.equal(limitedTurn.message.status, "error");

const limitBlock = limitedTurn.message.blocks[0];

assert.ok(limitBlock?.type === "error");
assert.equal(limitBlock.code, "TOOL_LIMIT");

assert.deepEqual(buildToolBlocks("generateReport", report), [
  {
    type: "file",
    reportId: report.reportId,
    filename: report.filename,
    downloadUrl: report.downloadUrl,
    mimeType: "text/csv",
  },
]);

console.log("Agente: herramientas, ciclo, errores, timeout y límites superados.");