import { randomUUID } from "node:crypto";
import type {
  ChatMessage,
  LlmClient,
  LlmMessage,
  ToolResult,
  ToolTrace,
  AgentBlock,
} from "../types/chat.js";
import {
  toolRegistry,
  type RegisteredTool,
} from "./toolRegistry.js";
import { buildToolBlocks } from "./buildToolBlocks.js";

type AgentOptions = {
  llmClient: LlmClient;
  history: LlmMessage[];
  tools?: ReadonlyMap<string, RegisteredTool>;
  maxToolCalls?: number;
  toolTimeoutMs?: number;
  llmTimeoutMs?: number;
  maxPayloadBytes?: number;
};

type AgentTurnResult = {
  message: ChatMessage;
  history: LlmMessage[];
};

const SYSTEM_PROMPT = `
Eres el asistente de MarketLab.
Utiliza las herramientas para obtener cifras de mercado y backtesting.
Solo cita cifras presentes en los resultados de las herramientas.
Los datos disponibles son simulados, no cotizaciones reales.
No inventes resultados, IDs ni enlaces de descarga.
Si una herramienta falla o faltan datos, indícalo explícitamente.
Los valores null de indicadores no equivalen a cero.
Responde en español y distingue resultados de interpretación.
Los umbrales RSI 2 < 10 para entrar y RSI 2 > 70 para salir
son reglas de esta demo. No los atribuyas a Connors ni a otra
estrategia externa.
No presentes las señales de la demo como recomendaciones de inversión.
`;

class DeadlineError extends Error {}

async function withTimeout<T>(
  operation: () => Promise<T>,
  milliseconds: number,
  onTimeout: () => void = () => {},
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new DeadlineError("Tiempo de espera agotado."));
          onTimeout();
        }, milliseconds);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

// Solo conserva campos conocidos en las trazas.
function traceArgs(value: unknown, depth = 0): Record<string, unknown> {
  if (
    depth > 2 ||
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return {};
  }

  const allowed = new Set([
    "symbol", "interval", "indicator", "from", "to",
    "initialCapital", "commissionBps", "backtestId",
    "strategy", "name", "entryBelow", "exitAbove",
    "first", "second",
  ]);

  const result: Record<string, unknown> = {};

  for (const [key, item] of Object.entries(value)) {
    if (!allowed.has(key)) continue;

    if (typeof item === "string") {
      result[key] = item.slice(0, 200);
    } else if (
      typeof item === "number" ||
      typeof item === "boolean" ||
      item === null
    ) {
      result[key] = item;
    } else {
      result[key] = traceArgs(item, depth + 1);
    }
  }

  return result;
}

export async function runAgentTurn({
  llmClient,
  history,
  tools = toolRegistry,
  maxToolCalls = 5,
  toolTimeoutMs = 5000,
  llmTimeoutMs = 30000,
  maxPayloadBytes = 16000,
}: AgentOptions): Promise<AgentTurnResult> {
  if (
    !Number.isInteger(maxToolCalls) ||
    maxToolCalls < 1 ||
    !Number.isFinite(toolTimeoutMs) ||
    toolTimeoutMs <= 0 ||
    !Number.isFinite(llmTimeoutMs) ||
    llmTimeoutMs <= 0 ||
    !Number.isInteger(maxPayloadBytes) ||
    maxPayloadBytes < 1
  ) {
    throw new Error("Configuración inválida del agente.");
  }

  const messages = structuredClone(history);
  const traces: ToolTrace[] = [];
  const generatedBlocks: AgentBlock[] = [];
  let calls = 0;

  function finish(
    text: string,
    errorCode?: string,
  ): AgentTurnResult {
    messages.push({
      role: "assistant",
      text,
      toolCalls: [],
    });

    return {
      message: {
        id: randomUUID(),
        role: "assistant",
        status: errorCode ? "error" : "completed",
        blocks: [
          ...generatedBlocks,
          ...(errorCode
            ? [{
                type: "error" as const,
                code: errorCode,
                message: text,
              }]
            : [{
                type: "markdown" as const,
                text,
              }]),
        ],
        toolTraces: traces,
      },
      history: messages,
    };
  }

  // Como máximo: cinco rondas con herramientas y una respuesta final.
  for (let round = 0; round <= maxToolCalls; round += 1) {
    const controller = new AbortController();

    let completion;

    try {
      completion = await withTimeout(
        () =>
          llmClient.complete({
            systemPrompt: SYSTEM_PROMPT,
            messages: structuredClone(messages),
            tools: [...tools.values()].map((tool) => tool.definition),
            signal: controller.signal,
          }),
        llmTimeoutMs,
        () => controller.abort(),
      );
    } catch (error) {
      return finish(
        error instanceof DeadlineError
          ? "El modelo tardó demasiado en responder."
          : "No se pudo obtener una respuesta del modelo.",
        error instanceof DeadlineError ? "LLM_TIMEOUT" : "LLM_ERROR",
      );
    }

    if (completion.toolCalls.length === 0) {
      // Conservamos el estado interno del proveedor para futuros turnos.
      const response = finish(
        completion.text || "El modelo no devolvió una respuesta.",
        completion.text ? undefined : "EMPTY_RESPONSE",
      );

      const lastMessage = messages.at(-1);

      if (
        lastMessage?.role === "assistant" &&
        completion.providerState !== undefined
      ) {
        lastMessage.providerState = completion.providerState;
      }

      return response;
    }

    if (completion.toolCalls.length > maxToolCalls - calls) {
      return finish(
        "Se alcanzó el límite de herramientas para este turno.",
        "TOOL_LIMIT",
      );
    }

    messages.push({
      role: "assistant",
      text: completion.text,
      toolCalls: completion.toolCalls,
      ...(completion.providerState !== undefined
        ? { providerState: completion.providerState }
        : {}),
    });

    for (const call of completion.toolCalls) {
      calls += 1;

      const start = performance.now();
      const tool = tools.get(call.name);
      let result: ToolResult;

      if (tool === undefined) {
        result = {
          ok: false,
          error: {
            code: "UNKNOWN_TOOL",
            message: "La herramienta solicitada no está registrada.",
          },
        };
      } else {
        try {
          const data = await withTimeout(
            () => tool.execute(call.arguments),
            toolTimeoutMs,
          );

          const serialized = JSON.stringify(data);

          if (
            serialized === undefined ||
            Buffer.byteLength(serialized, "utf8") > maxPayloadBytes
          ) {
            result = {
              ok: false,
              error: {
                code: "PAYLOAD_LIMIT",
                message: "El resultado excede el tamaño permitido.",
              },
            };
          } else {
            result = { ok: true, data };
          }
        } catch (error) {
          result = {
            ok: false,
            error: {
              code:
                error instanceof DeadlineError
                  ? "TOOL_TIMEOUT"
                  : "TOOL_ERROR",
              message:
                error instanceof DeadlineError
                  ? "La herramienta excedió el tiempo permitido."
                  : "No se pudo ejecutar la herramienta. Revisa sus argumentos y la disponibilidad de los datos.",
            },
          };
        }
      }

      if (result.ok) {
        generatedBlocks.push(...buildToolBlocks(call.name, result.data));
      }

      traces.push({
        toolName: call.name,
        args: traceArgs(call.arguments),
        ok: result.ok,
        durationMs: performance.now() - start,
        ...(!result.ok ? { error: result.error } : {}),
      });

      messages.push({
        role: "tool",
        toolCallId: call.id,
        toolName: call.name,
        result,
      });
    }
  }

  return finish(
    "Se alcanzó el límite de rondas del agente.",
    "ROUND_LIMIT",
  );
}