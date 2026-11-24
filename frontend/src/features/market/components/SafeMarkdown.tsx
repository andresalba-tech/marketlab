import ReactMarkdown from "react-markdown";

function safeMarkdownUrl(value: string): string {
  // Descargas generadas por nuestro backend.
  if (/^\/api\/reports\/[a-zA-Z0-9_-]+\/download$/.test(value)) {
    return value;
  }

  // Enlaces externos únicamente por HTTPS.
  if (!/^https:\/\//i.test(value)) {
    return "";
  }

  try {
    const url = new URL(value);

    if (
      url.protocol !== "https:" ||
      url.username !== "" ||
      url.password !== ""
    ) {
      return "";
    }

    return url.href;
  } catch {
    return "";
  }
}

export function SafeMarkdown({ text }: { text: string }) {
  return (
    <ReactMarkdown
      skipHtml
      allowedElements={[
        "p",
        "br",
        "strong",
        "em",
        "ul",
        "ol",
        "li",
        "blockquote",
        "pre",
        "code",
        "a",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "hr",
      ]}
      urlTransform={safeMarkdownUrl}
      components={{
        a: ({ href, children }) =>
          href ? (
            <a href={href} rel="noreferrer">
              {children}
            </a>
          ) : (
            <span>{children}</span>
          ),
      }}
    >
      {text}
    </ReactMarkdown>
  );
}