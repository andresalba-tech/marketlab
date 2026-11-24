// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SafeMarkdown } from "./SafeMarkdown";

function renderMarkdown(text: string): Document {
  const html = renderToStaticMarkup(
    <SafeMarkdown text={text} />,
  );

  return new DOMParser().parseFromString(html, "text/html");
}

describe("SafeMarkdown", () => {
  it("muestra títulos, negritas, listas y código", () => {
    const document = renderMarkdown(
      "# Resultado\n\n**Datos simulados**\n\n- MSFT\n- AAPL\n\n`rsi2`",
    );

    expect(document.querySelector("h1")?.textContent)
      .toBe("Resultado");

    expect(document.querySelector("strong")?.textContent)
      .toBe("Datos simulados");

    expect(document.querySelectorAll("li")).toHaveLength(2);

    expect(document.querySelector("code")?.textContent)
      .toBe("rsi2");
  });

  it("descarta HTML crudo y no genera imágenes", () => {
    const document = renderMarkdown(`
<script>alert(1)</script>

<img src="x" onerror="alert(2)" />

<svg onload="alert(3)"></svg>

![Imagen externa](https://example.com/image.png)

**Texto permitido**
    `);

    expect(document.querySelector("script, img, svg")).toBeNull();

    expect(document.querySelector("strong")?.textContent)
      .toBe("Texto permitido");

    for (const element of document.querySelectorAll("*")) {
      for (const attribute of element.attributes) {
        expect(attribute.name.toLowerCase().startsWith("on"))
          .toBe(false);
      }
    }
  });

  it("permite HTTPS y descargas de reportes", () => {
    const document = renderMarkdown(`
[Documentación](https://example.com/docs)

[Reporte](/api/reports/report-123/download)
    `);

    const links = document.querySelectorAll("a");

    expect(links).toHaveLength(2);

    expect(links[0]?.getAttribute("href"))
      .toBe("https://example.com/docs");

    expect(links[1]?.getAttribute("href"))
      .toBe("/api/reports/report-123/download");
  });

  it("bloquea enlaces no permitidos y conserva su texto", () => {
    const destinations = [
      "javascript:alert%281%29",
      "data:text/html,contenido",
      "http://example.com",
      "//example.com",
      "/api/backtests",
      "https://usuario:clave@example.com",
    ];

    for (const destination of destinations) {
      const document = renderMarkdown(
        `[Enlace bloqueado](${destination})`,
      );

      expect(document.querySelector("a")).toBeNull();
      expect(document.body.textContent)
        .toContain("Enlace bloqueado");
    }
  });
});