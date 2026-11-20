import assert from "node:assert/strict";
import {
  listIndicators,
  loadIndicator,
  isIndicatorDefinition,
} from "../services/indicatorRegistry.js";

const names = await listIndicators();

// La demo debe tener indicadores.
assert.ok(names.length > 0, "No se encontraron indicadores.");

// Los nombres deben estar ordenados y no repetirse.
assert.deepEqual(names, [...names].sort());
assert.equal(new Set(names).size, names.length);

// Cada archivo descubierto debe cargar una definición válida.
for (const name of names) {
  const indicator = await loadIndicator(name);

  assert.notEqual(
    indicator,
    null,
    `No se pudo cargar el indicador "${name}".`,
  );

  assert.equal(
    isIndicatorDefinition(indicator),
    true,
    `La definición de "${name}" no es válida.`,
  );
}

// Una ruta fuera del catálogo no debe cargarse.
assert.equal(await loadIndicator("../server"), null);

// Tampoco debe cargarse un nombre vacío.
assert.equal(await loadIndicator(""), null);

console.log(
  "Registro de indicadores: todas las comprobaciones pasaron.",
);