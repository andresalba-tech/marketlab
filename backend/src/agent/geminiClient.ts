import { GoogleGenAI } from "@google/genai";
import type { Content, Part } from "@google/genai";
import { randomUUID } from "node:crypto";
import type {
  LlmClient,
  LlmMessage,
  LlmToolCall,
} from "../types/chat.js";

function toContents(messages: LlmMessage[]): Content[] {
  const contents: Content[] = [];

  // Relaciona nuestros IDs internos con los IDs originales de Gemini.
  const providerIds = new Map<string, string>();

  for (const message of messages) {
    if (message.role === "user") {
      contents.push({
        role: "user",
        parts: [{ text: message.text }],
      });
      continue;
    }

    if (message.role === "assistant") {
      if (message.providerState !== undefined) {
        // Este estado procede exclusivamente de nuestro cliente Gemini.
        const content = message.providerState as Content;

        const calls = (content.parts ?? []).flatMap((part) =>
          part.functionCall ? [part.functionCall] : [],
        );

        message.toolCalls.forEach((call, index) => {
          const providerId = calls[index]?.id;

          if (providerId) {
            providerIds.set(call.id, providerId);
          }
        });

        contents.push(structuredClone(content));
      } else {
        if (message.toolCalls.length > 0) {
          throw new Error(
            "Falta el estado de Gemini para reconstruir las llamadas.",
          );
        }

        contents.push({
          role: "model",
          parts: [{ text: message.text }],
        });
      }

      continue;
    }

    const providerId = providerIds.get(message.toolCallId);

    const part: Part = {
      functionResponse: {
        name: message.toolName,
        ...(providerId ? { id: providerId } : {}),
        response: message.result.ok
          ? { ok: true, data: message.result.data }
          : { ok: false, error: message.result.error },
      },
    };

    const previous = contents.at(-1);

    // Los resultados de llamadas paralelas van juntos.
    if (
      previous?.role === "user" &&
      previous.parts?.some((item) => item.functionResponse)
    ) {
      previous.parts.push(part);
    } else {
      contents.push({
        role: "user",
        parts: [part],
      });
    }
  }

  return contents;
}

export function createGeminiClient(): LlmClient {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const model = process.env.GEMINI_MODEL?.trim();

  if (!apiKey) {
    throw new Error("Falta configurar GEMINI_API_KEY.");
  }

  if (!model) {
    throw new Error("Falta configurar GEMINI_MODEL.");
  }

  const client = new GoogleGenAI({ apiKey });

  return {
    async complete(request) {
      const parameters = {
        model,
        contents: toContents(request.messages),
        config: {
          systemInstruction: request.systemPrompt,
          abortSignal: request.signal,
          tools: [
            {
              functionDeclarations: request.tools.map((tool) => ({
                name: tool.name,
                description: tool.description,
                parametersJsonSchema: tool.parameters,
              })),
            },
          ],
        },
      };

      let content: Content;

      if (request.onTextDelta) {
        const parts: Part[] = [];

        const stream = await client.models.generateContentStream(
          parameters,
        );

        for await (const chunk of stream) {
          request.signal.throwIfAborted();

          const chunkContent = chunk.candidates?.[0]?.content;

          for (const part of chunkContent?.parts ?? []) {
            // Conservamos las partes originales, incluidas firmas
            // y llamadas a herramientas, para reconstruir el historial.
            parts.push(structuredClone(part));

            // Solo enviamos al usuario texto visible.
            if (
              !part.thought &&
              typeof part.text === "string" &&
              part.text.length > 0
            ) {
              request.onTextDelta(part.text);
            }
          }
        }

        request.signal.throwIfAborted();

        if (parts.length === 0) {
          throw new Error("Gemini no devolvió contenido.");
        }

        content = {
          role: "model",
          parts,
        };
      } else {
        const response = await client.models.generateContent(
          parameters,
        );

        const responseContent = response.candidates?.[0]?.content;

        if (!responseContent) {
          throw new Error("Gemini no devolvió contenido.");
        }

        content = responseContent;
      }

      const toolCalls: LlmToolCall[] = [];

      for (const part of content.parts ?? []) {
        const call = part.functionCall;

        if (!call) continue;

        if (!call.name) {
          throw new Error("Gemini devolvió una llamada sin nombre.");
        }

        toolCalls.push({
          id: call.id || randomUUID(),
          name: call.name,
          arguments: call.args ?? {},
        });
      }

      const text = (content.parts ?? [])
        .filter((part) => !part.thought && typeof part.text === "string")
        .map((part) => part.text ?? "")
        .join("");

      return {
        text,
        toolCalls,
        providerState: structuredClone(content),
      };
    },
  };
}