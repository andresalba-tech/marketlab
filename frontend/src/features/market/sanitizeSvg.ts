import createDOMPurify from "dompurify";

// Instancia dedicada a nuestros gráficos SVG.
const purifier = createDOMPurify(window);

purifier.addHook("uponSanitizeAttribute", (_node, data) => {
  // Solo aceptamos colores hexadecimales o "none".
  // Así evitamos referencias como fill="url(...)".
  if (data.attrName === "fill" || data.attrName === "stroke") {
    const validColor =
      /^(?:#[0-9a-f]{3}|#[0-9a-f]{6}|none)$/i.test(data.attrValue);

    if (!validColor) {
      data.keepAttr = false;
    }
  }
});

export function sanitizeSvg(content: string): string {
  return purifier.sanitize(content, {
    ALLOWED_TAGS: [
      "svg",
      "g",
      "title",
      "desc",
      "rect",
      "line",
      "text",
    ],
    ALLOWED_ATTR: [
      "xmlns",
      "viewBox",
      "width",
      "height",
      "x",
      "y",
      "x1",
      "y1",
      "x2",
      "y2",
      "fill",
      "stroke",
      "stroke-width",
      "font-family",
      "font-size",
      "text-anchor",
      "role",
    ],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    RETURN_TRUSTED_TYPE: false,
  });
}