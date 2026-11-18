import { readdir } from "node:fs/promises";
import type { IndicatorDefinition } from "../types/indicator.js";

const indicatorsDirectory = new URL("../indicators/", import.meta.url);

export async function listIndicators(): Promise<string[]> {
  const entries = await readdir(indicatorsDirectory, {
    withFileTypes: true,
  });

  const extension = import.meta.url.endsWith(".ts") ? ".ts" : ".js";

  return entries
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(extension) &&
        !entry.name.endsWith(".d.ts"),
    )
    .map((entry) => entry.name.slice(0, -extension.length))
    .sort();
}

function isIndicatorDefinition(
  value: unknown,
): value is IndicatorDefinition {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return (
    "description" in value &&
    typeof value.description === "string" &&
    "calculate" in value &&
    typeof value.calculate === "function"
  );
}

export async function loadIndicator(
  name: string,
): Promise<IndicatorDefinition | null> {
  const available = await listIndicators();

  if (!available.includes(name)) {
    return null;
  }

  const extension = import.meta.url.endsWith(".ts") ? ".ts" : ".js";

  const fileUrl = new URL(
    `${encodeURIComponent(name)}${extension}`,
    indicatorsDirectory,
  );

  const loadedModule = await import(fileUrl.href);
  const definition: unknown = loadedModule.default;

  if (!isIndicatorDefinition(definition)) {
    throw new Error(
      `El archivo "${name}" no exporta una definición válida de indicador.`,
    );
  }

  return definition;
}