import assert from "node:assert/strict";
import { createGeminiClient } from "../agent/geminiClient.js";
import { runAgentTurn } from "../agent/runAgentTurn.js";

async function main(): Promise<void> {
  const gemini = createGeminiClient();
  const result = await runAgentTurn({
    llmTimeoutMs: 60000,
    llmClient: {
        async complete(request) {
            try {
            return await gemini.complete(request);
            } catch (error) {
            const apiKey = process.env.GEMINI_API_KEY?.trim();

            let message =
                error instanceof Error
                ? error.message
                : "Error sin mensaje.";

            if (apiKey) {
                message = message.split(apiKey).join("[CLAVE OCULTA]");
            }

            message = message.replace(
                /AIza[0-9A-Za-z_-]+/g,
                "[CLAVE OCULTA]",
            );

            const status =
                typeof error === "object" &&
                error !== null &&
                "status" in error &&
                (typeof error.status === "number" ||
                typeof error.status === "string")
                ? error.status
                : "Sin código HTTP";

            console.error("Estado Gemini:", status);
            console.error("Detalle Gemini:", message);

            throw error;
            }
        },
    },
    history: [
      {
        role: "user",
        text:
          "Usa calculateIndicators para calcular rsi2 de MSFT " +
          "con intervalo 1d y sin rango de fechas. " +
          "Indica la fecha y el valor del último punto devuelto. " +
          "Aclara que son datos simulados.",
      },
    ],
  });

  for (const block of result.message.blocks) {
    if (block.type === "markdown") {
      console.log(block.text);
    } else if (block.type === "error") {
      console.error(`${block.code}: ${block.message}`);
    }
  }

  console.table(
    result.message.toolTraces.map((trace) => ({
      herramienta: trace.toolName,
      correcta: trace.ok,
      duracionMs: Math.round(trace.durationMs),
      error: trace.error?.code ?? "",
    })),
  );

  assert.equal(
    result.message.status,
    "completed",
    "El turno debe completarse.",
  );

  assert.ok(
    result.message.toolTraces.some(
      (trace) =>
        trace.toolName === "calculateIndicators" && trace.ok,
    ),
    "Gemini debe solicitar calculateIndicators y ejecutarla correctamente.",
  );

  console.log("Turno real con Gemini completado.");
}

main().catch(() => {
  console.error(
    "La prueba manual no se completó correctamente. Revisa el resultado anterior.",
  );
  process.exitCode = 1;
});