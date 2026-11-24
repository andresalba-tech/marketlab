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
      id: `${completedTurn.message.id}-text`,
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
    id: `report-${report.reportId}-file`,
    type: "file",
    reportId: report.reportId,
    filename: report.filename,
    downloadUrl: report.downloadUrl,
    mimeType: "text/csv",
  },
]);

const chartBlocks = buildToolBlocks("runBacktest", backtest);

const chartBlock = chartBlocks.find(
  (block) => block.type === "chart",
);

assert.ok(chartBlock?.type === "chart");

assert.equal(
  chartBlock.id,
  `backtest-${backtest.backtestId}-chart`,
);

assert.deepEqual(chartBlock.series, [
  {
    name: "RSI 2",
    points: storedBacktest.equityCurve.map((point) => ({
      time: point.time,
      value: point.equity,
    })),
  },
  {
    name: "Comprar y mantener",
    points: storedBacktest.benchmark.equityCurve.map((point) => ({
      time: point.time,
      value: point.equity,
    })),
  },
]);

// Reconstruir el bloque conserva su ID.
const repeatedChart = buildToolBlocks("runBacktest", backtest).find(
  (block) => block.type === "chart",
);

assert.equal(repeatedChart?.id, chartBlock.id);

const svgBlock = buildToolBlocks("runBacktest", backtest).find(
  (block) => block.type === "svg",
);

assert.ok(svgBlock?.type === "svg");

assert.equal(
  svgBlock.id,
  `backtest-${backtest.backtestId}-svg`,
);

assert.ok(svgBlock.content.startsWith("<svg"));

for (const metric of [
  storedBacktest.metrics.totalReturnPct,
  storedBacktest.metrics.maxDrawdownPct,
  storedBacktest.benchmark.totalReturnPct,
  storedBacktest.benchmark.maxDrawdownPct,
]) {
  assert.ok(
    svgBlock.content.includes(`${metric.toFixed(2)} %`),
    `El SVG debe contener la métrica ${metric}.`,
  );
}

assert.equal(
  svgBlock.content,
  buildToolBlocks("runBacktest", backtest).find(
    (block) => block.type === "svg",
  )?.content,
);

// Exportación SVG del backtest existente.
const svgReportResult = await generateReport({
  backtestId: backtest.backtestId,
  format: "svg",
});

const savedSvgReport = getReport(svgReportResult.reportId);

assert.ok(savedSvgReport);

assert.equal(svgReportResult.mimeType, "image/svg+xml");
assert.equal(savedSvgReport.mimeType, "image/svg+xml");

assert.equal(
  svgReportResult.filename,
  `backtest-${backtest.backtestId}.svg`,
);

assert.equal(savedSvgReport.filename, svgReportResult.filename);

assert.equal(
  svgReportResult.downloadUrl,
  `/api/reports/${svgReportResult.reportId}/download`,
);

// El archivo descargable debe coincidir con el SVG del chat.
const expectedSvgBlock = buildToolBlocks("runBacktest", backtest)
  .find((block) => block.type === "svg");

assert.ok(expectedSvgBlock?.type === "svg");
assert.equal(savedSvgReport.content, expectedSvgBlock.content);

// Sus cifras deben proceder del resultado guardado.
for (const metric of [
  storedBacktest.metrics.totalReturnPct,
  storedBacktest.metrics.maxDrawdownPct,
  storedBacktest.benchmark.totalReturnPct,
  storedBacktest.benchmark.maxDrawdownPct,
]) {
  assert.ok(
    savedSvgReport.content.includes(`${metric.toFixed(2)} %`),
    `El reporte SVG debe contener la métrica ${metric}.`,
  );
}

// CSV sigue siendo el formato predeterminado.
const defaultCsvReport = await generateReport({
  backtestId: backtest.backtestId,
});

assert.equal(defaultCsvReport.mimeType, "text/csv");
assert.ok(defaultCsvReport.filename.endsWith(".csv"));
assert.equal(
  getReport(defaultCsvReport.reportId)?.mimeType,
  "text/csv",
);

// Rechazamos formatos no admitidos.
await assert.rejects(
  () =>
    generateReport({
      backtestId: backtest.backtestId,
      format: "pdf",
    }),
  /format debe ser csv o svg/,
);

await assert.rejects(
  () =>
    generateReport({
      backtestId: backtest.backtestId,
      format: null,
    }),
  /format debe ser csv o svg/,
);

// Verifica el orden de eventos sin depender de Gemini.
const eventTypes: string[] = [];
const eventMessageIds: string[] = [];
const readyBlockIds: string[] = [];
let eventTestCompletions = 0;

const eventTestTurn = await runAgentTurn({
  history: [{ role: "user", text: "Prueba de eventos" }],
  tools: new Map([
    [
      "testEvents",
      {
        definition: {
          name: "testEvents",
          description: "Herramienta local para comprobar eventos.",
          parameters: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
        },
        async execute() {
          return { value: 42 };
        },
      },
    ],
  ]),
  llmClient: {
    async complete() {
      eventTestCompletions += 1;

      if (eventTestCompletions === 1) {
        return {
          text: "",
          toolCalls: [
            {
              id: "event-call-1",
              name: "testEvents",
              arguments: {},
            },
          ],
        };
      }

      // La herramienta debe haber terminado antes de esta llamada.
      assert.deepEqual(eventTypes, [
        "message.started",
        "tool.started",
        "tool.completed",
      ]);

      return {
        text: "Resultado: 42.",
        toolCalls: [],
      };
    },
  },
  onEvent(event) {
    eventTypes.push(event.type);
    eventMessageIds.push(event.messageId);

    if (event.type === "tool.started") {
      assert.equal(event.payload.toolCallId, "event-call-1");
      assert.equal(event.payload.toolName, "testEvents");
    }

    if (event.type === "tool.completed") {
      assert.equal(event.payload.toolCallId, "event-call-1");
      assert.equal(event.payload.trace.ok, true);
    }

    if (event.type === "block.ready") {
      readyBlockIds.push(event.payload.block.id);
    }

    if (event.type === "message.completed") {
      assert.equal(event.payload.message.status, "completed");
    }
  },
});

assert.equal(eventTestCompletions, 2);

assert.deepEqual(eventTypes, [
  "message.started",
  "tool.started",
  "tool.completed",
  "block.ready",
  "message.completed",
]);

assert.ok(
  eventMessageIds.every((id) => id === eventTestTurn.message.id),
  "Todos los eventos del turno deben compartir el mismo messageId.",
);

assert.deepEqual(
  readyBlockIds,
  eventTestTurn.message.blocks.map((block) => block.id),
);

assert.equal(
  new Set(readyBlockIds).size,
  readyBlockIds.length,
  "Esta prueba no debe emitir bloques duplicados.",
);

// Cancelar mientras el modelo está respondiendo.
const cancellationController = new AbortController();
const cancellationEvents: string[] = [];
let modelReceivedAbort = false;
let cancellationReported = false;

const cancelledModelTurn = await runAgentTurn({
  history: [{ role: "user", text: "Prueba de cancelación" }],
  signal: cancellationController.signal,
  llmClient: {
    async complete(request) {
      request.signal.addEventListener(
        "abort",
        () => {
          modelReceivedAbort = true;
        },
        { once: true },
      );

      // Cancelamos cuando sabemos que el modelo ya fue llamado.
      cancellationController.abort();

      // Simulamos un modelo que nunca entrega respuesta.
      return new Promise<never>(() => {});
    },
  },
  onEvent(event) {
    cancellationEvents.push(event.type);

    if (event.type === "message.failed") {
      assert.equal(event.payload.code, "TURN_CANCELLED");
      assert.equal(event.payload.cancelled, true);
      cancellationReported = true;
    }
  },
});

assert.equal(modelReceivedAbort, true);
assert.equal(cancellationReported, true);
assert.equal(cancelledModelTurn.message.status, "error");

assert.deepEqual(cancellationEvents, [
  "message.started",
  "block.ready",
  "message.failed",
]);

const cancellationBlock = cancelledModelTurn.message.blocks.at(-1);

assert.ok(cancellationBlock?.type === "error");
assert.equal(cancellationBlock.code, "TURN_CANCELLED");
assert.equal(cancelledModelTurn.message.toolTraces.length, 0);

// Cancelación durante una herramienta con otra llamada pendiente.
const toolCancelController = new AbortController();
let firstToolExecutions = 0;
let pendingToolExecutions = 0;
let toolCancelModelCalls = 0;
let toolCancellationReported = false;

const cancelledToolsTurn = await runAgentTurn({
  history: [{ role: "user", text: "Cancelar herramientas" }],
  signal: toolCancelController.signal,
  tools: new Map([
    [
      "cancelFirst",
      {
        definition: {
          name: "cancelFirst",
          description: "Cancela el turno durante su ejecución.",
          parameters: {
            type: "object",
            properties: {},
          },
        },
        async execute() {
          firstToolExecutions += 1;
          toolCancelController.abort();

          return new Promise<never>(() => {});
        },
      },
    ],
    [
      "mustNotRun",
      {
        definition: {
          name: "mustNotRun",
          description: "No debe ejecutarse tras la cancelación.",
          parameters: {
            type: "object",
            properties: {},
          },
        },
        async execute() {
          pendingToolExecutions += 1;
          return { unexpected: true };
        },
      },
    ],
  ]),
  llmClient: {
    async complete() {
      toolCancelModelCalls += 1;

      return {
        text: "",
        toolCalls: [
          {
            id: "cancel-tool-1",
            name: "cancelFirst",
            arguments: {},
          },
          {
            id: "cancel-tool-2",
            name: "mustNotRun",
            arguments: {},
          },
        ],
      };
    },
  },
  onEvent(event) {
    if (event.type === "message.failed") {
      assert.equal(event.payload.code, "TURN_CANCELLED");
      assert.equal(event.payload.cancelled, true);
      toolCancellationReported = true;
    }
  },
});

assert.equal(firstToolExecutions, 1);
assert.equal(pendingToolExecutions, 0);
assert.equal(toolCancelModelCalls, 1);
assert.equal(toolCancellationReported, true);
assert.equal(cancelledToolsTurn.message.status, "error");

// Ambas llamadas deben tener una respuesta en el historial,
// aunque la segunda nunca se haya ejecutado.
const cancelledToolReplies = cancelledToolsTurn.history.filter(
  (message) => message.role === "tool",
);

assert.equal(cancelledToolReplies.length, 2);

assert.deepEqual(
  cancelledToolReplies.map((message) => message.toolCallId),
  ["cancel-tool-1", "cancel-tool-2"],
);

for (const reply of cancelledToolReplies) {
  assert.equal(reply.result.ok, false);

  if (!reply.result.ok) {
    assert.equal(reply.result.error.code, "TURN_CANCELLED");
  }
}

// Solo la herramienta que comenzó debe aparecer en las trazas.
assert.equal(cancelledToolsTurn.message.toolTraces.length, 1);
assert.equal(
  cancelledToolsTurn.message.toolTraces[0]?.toolName,
  "cancelFirst",
);
assert.equal(
  cancelledToolsTurn.message.toolTraces[0]?.error?.code,
  "TURN_CANCELLED",
);

// Texto progresivo con un cliente falso.
const streamingEventTypes: string[] = [];
const streamedFragments: string[] = [];
const streamedBlockIds: string[] = [];
let streamingCompletionReported = false;

const streamingTurn = await runAgentTurn({
  history: [{ role: "user", text: "Prueba de texto progresivo" }],
  llmClient: {
    async complete(request) {
      assert.ok(request.onTextDelta);

      request.onTextDelta("Hola ");
      request.onTextDelta("");
      request.onTextDelta("MarketLab.");

      // Los fragmentos ya se entregaron antes de devolver
      // la respuesta completa.
      assert.deepEqual(streamedFragments, [
        "Hola ",
        "MarketLab.",
      ]);
      assert.equal(streamingCompletionReported, false);

      return {
        text: "Hola MarketLab.",
        toolCalls: [],
      };
    },
  },
  onEvent(event) {
    streamingEventTypes.push(event.type);

    if (event.type === "text.delta") {
      streamedFragments.push(event.payload.delta);
      streamedBlockIds.push(event.payload.blockId);
    }

    if (event.type === "message.completed") {
      streamingCompletionReported = true;
    }
  },
});

assert.deepEqual(streamingEventTypes, [
  "message.started",
  "text.delta",
  "text.delta",
  "block.ready",
  "message.completed",
]);

assert.equal(
  streamedFragments.join(""),
  "Hola MarketLab.",
);

assert.ok(
  streamedBlockIds.every(
    (id) => id === `${streamingTurn.message.id}-stream-0`,
  ),
);

assert.equal(streamingCompletionReported, true);

assert.deepEqual(streamingTurn.message.blocks, [
  {
    id: `${streamingTurn.message.id}-text`,
    type: "markdown",
    text: "Hola MarketLab.",
  },
]);

console.log("Agente: herramientas, ciclo, errores, timeout y límites superados.");