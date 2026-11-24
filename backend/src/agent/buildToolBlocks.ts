import type { AgentBlock } from "../types/chat.js";
import { getBacktest } from "../services/backtestStore.js";
import { getReport } from "../services/reportStore.js";
import { buildBacktestSvg } from "../services/buildBacktestSvg.js";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function backtestTable(value: unknown): AgentBlock[] {
  if (!isObject(value) || typeof value.backtestId !== "string") {
    return [];
  }

  const result = getBacktest(value.backtestId);

  if (!result) return [];

  return [
    {
      id: `backtest-${result.id}-table`,
      type: "table",
      title:
        `Backtest ${result.request.symbol} · ${result.request.interval}` +
        ` · Capital ${result.request.initialCapital}` +
        ` · Comisión ${result.request.commissionBps} bps` +
        ` · ${result.request.from ?? "Inicio disponible"}` +
        ` → ${result.request.to ?? "Fin disponible"}`,
      columns: ["Métrica", "RSI 2", "Comprar y mantener"],
      rows: [
        [
          "Capital final",
          result.metrics.finalCapital,
          result.benchmark.finalCapital,
        ],
        [
          "Retorno total (%)",
          result.metrics.totalReturnPct,
          result.benchmark.totalReturnPct,
        ],
        [
          "Caída máxima (%)",
          result.metrics.maxDrawdownPct,
          result.benchmark.maxDrawdownPct,
        ],
        ["Operaciones cerradas", result.metrics.tradeCount, null],
        ["Ganadoras (%)", result.metrics.winRatePct, null],
      ],
    },
    {
      id: `backtest-${result.id}-svg`,
      type: "svg",
      title:
        `Retorno y drawdown — ${result.request.symbol}` +
        ` · ${result.request.interval}`,
      content: buildBacktestSvg(result),
    },
    {
      id: `backtest-${result.id}-chart`,
      type: "chart",
      title:
        `Evolución del capital — ${result.request.symbol}` +
        ` · ${result.request.interval}`,
      series: [
        {
          name: "RSI 2",
          points: result.equityCurve.map((point) => ({
            time: point.time,
            value: point.equity,
          })),
        },
        {
          name: "Comprar y mantener",
          points: result.benchmark.equityCurve.map((point) => ({
            time: point.time,
            value: point.equity,
          })),
        },
      ],
    },
  ];
}

export function buildToolBlocks(
  toolName: string,
  data: unknown,
): AgentBlock[] {
  if (!isObject(data)) return [];

  if (toolName === "runBacktest") {
    return backtestTable(data);
  }

  if (toolName === "compareStrategies") {
    return [
      ...backtestTable(data.first),
      ...backtestTable(data.second),
    ];
  }

  if (
    toolName === "generateReport" &&
    typeof data.reportId === "string"
  ) {
    const report = getReport(data.reportId);

    if (!report) return [];

    return [
      {
        id: `report-${report.id}-file`,
        type: "file",
        reportId: report.id,
        filename: report.filename,
        downloadUrl: `/api/reports/${report.id}/download`,
        mimeType: report.mimeType,
      },
    ];
  }

  return [];
}