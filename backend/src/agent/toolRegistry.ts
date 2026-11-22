import type { ToolDefinition } from "../types/chat.js";
import {
  calculateIndicators,
  calculateIndicatorsDefinition,
  runBacktestTool,
  runBacktestDefinition,
  compareStrategies,
  compareStrategiesDefinition,
  generateReport,
  generateReportDefinition,
} from "./tools.js";

export type RegisteredTool = {
  definition: ToolDefinition;
  execute: (args: unknown) => Promise<unknown>;
};

export const toolRegistry: ReadonlyMap<string, RegisteredTool> =
  new Map<string, RegisteredTool>([
    [
      calculateIndicatorsDefinition.name,
      {
        definition: calculateIndicatorsDefinition,
        execute: calculateIndicators,
      },
    ],
    [
      runBacktestDefinition.name,
      {
        definition: runBacktestDefinition,
        execute: runBacktestTool,
      },
    ],
    [
      compareStrategiesDefinition.name,
      {
        definition: compareStrategiesDefinition,
        execute: compareStrategies,
      },
    ],
    [
      generateReportDefinition.name,
      {
        definition: generateReportDefinition,
        execute: generateReport,
      },
    ],
  ]);