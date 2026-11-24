// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { sanitizeSvg } from "./sanitizeSvg";

function parseResult(content: string): Document {
  return new DOMParser().parseFromString(
    sanitizeSvg(content),
    "image/svg+xml",
  );
}

describe("sanitizeSvg", () => {
  it("conserva los elementos y colores del gráfico válido", () => {
    const document = parseResult(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 740 340">
        <title>Comparación</title>
        <rect x="10" y="20" width="100" height="24" fill="#0284c7" />
        <text x="120" y="37">23.60 %</text>
      </svg>
    `);

    expect(document.querySelector("parsererror")).toBeNull();
    expect(document.documentElement.localName).toBe("svg");
    expect(document.documentElement.getAttribute("viewBox"))
      .toBe("0 0 740 340");
    expect(document.querySelector("rect")?.getAttribute("fill"))
      .toBe("#0284c7");
    expect(document.querySelector("text")?.textContent)
      .toBe("23.60 %");
  });

  it("elimina scripts, eventos y foreignObject", () => {
    const document = parseResult(`
      <svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)">
        <script>alert(1)</script>
        <foreignObject>
          <div xmlns="http://www.w3.org/1999/xhtml">Contenido externo</div>
        </foreignObject>
        <rect width="100" height="24" onclick="alert(2)" fill="#0284c7" />
      </svg>
    `);

    expect(document.querySelector("parsererror")).toBeNull();
    expect(document.querySelector("script")).toBeNull();
    expect(document.querySelector("foreignObject")).toBeNull();
    expect(document.querySelector("div")).toBeNull();

    for (const element of document.querySelectorAll("*")) {
      for (const attribute of element.attributes) {
        expect(attribute.name.toLowerCase().startsWith("on"))
          .toBe(false);
      }
    }

    expect(document.querySelector("rect")).not.toBeNull();
  });

  it("elimina enlaces, imágenes y referencias externas", () => {
    const document = parseResult(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <a href="javascript:alert(1)">
          <text x="10" y="20">Enlace</text>
        </a>
        <image href="https://example.com/image.svg" />
        <use href="https://example.com/external.svg#shape" />
        <rect
          width="100"
          height="24"
          fill="url(https://example.com/fill.svg#color)"
          stroke="url(#external)"
          style="fill: url(https://example.com/style.svg)"
        />
      </svg>
    `);

    expect(document.querySelector("parsererror")).toBeNull();
    expect(document.querySelector("a, image, use")).toBeNull();

    const rectangle = document.querySelector("rect");

    expect(rectangle).not.toBeNull();
    expect(rectangle?.hasAttribute("fill")).toBe(false);
    expect(rectangle?.hasAttribute("stroke")).toBe(false);
    expect(rectangle?.hasAttribute("style")).toBe(false);

    for (const element of document.querySelectorAll("*")) {
      expect(element.hasAttribute("href")).toBe(false);
      expect(element.hasAttribute("xlink:href")).toBe(false);
    }
  });
});