import assert from "node:assert/strict";
import { isIndicatorDefinition } from "../services/indicatorRegistry.js";

const validDefinition = {
  description: "Indicador de prueba",
  supportedIntervals: ["1d", "5m"],
  calculate: () => ({
    display: { placement: "overlay" },
    series: [],
  }),
};

// Una definición completa debe aceptarse.
assert.equal(isIndicatorDefinition(validDefinition), true);

// Valores que no son definiciones.
for (const value of [null, undefined, 42, "indicador", {}]) {
  assert.equal(isIndicatorDefinition(value), false);
}

// Falta la propiedad supportedIntervals.
assert.equal(
  isIndicatorDefinition({
    description: validDefinition.description,
    calculate: validDefinition.calculate,
  }),
  false,
);

// Intervalos con estructura o contenido inválidos.
for (const supportedIntervals of [
  "1d",
  [],
  [1],
  [""],
  ["   "],
  ["1d", null],
]) {
  assert.equal(
    isIndicatorDefinition({
      ...validDefinition,
      supportedIntervals,
    }),
    false,
  );
}

// La descripción debe ser texto.
assert.equal(
  isIndicatorDefinition({
    ...validDefinition,
    description: 123,
  }),
  false,
);

// calculate debe ser una función.
assert.equal(
  isIndicatorDefinition({
    ...validDefinition,
    calculate: "no soy una función",
  }),
  false,
);

console.log(
  "Definición de indicador: todas las comprobaciones pasaron.",
);