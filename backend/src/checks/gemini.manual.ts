import { GoogleGenAI } from "@google/genai";

async function main(): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("Falta configurar GEMINI_API_KEY.");
  }

  const client = new GoogleGenAI({ apiKey });

  const models = await client.models.list();

  console.log("Conexión con Gemini establecida.");
  console.log("Modelos Gemini disponibles:");

  for await (const model of models) {
    if (model.name?.includes("gemini")) {
      console.log(model.name);
    }
  }
}

main().catch(() => {
  console.error(
    "No se pudo consultar Gemini. Revisa la clave, su acceso a la API y la conexión.",
  );
  process.exitCode = 1;
});