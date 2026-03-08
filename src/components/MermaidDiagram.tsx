import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

let initialized = false;

function ensureInit() {
  if (initialized) return;
  initialized = true;
  mermaid.initialize({
    startOnLoad: false,
    theme: "base",
    themeVariables: {
      primaryColor: "#ede9fb",
      primaryTextColor: "#18152e",
      primaryBorderColor: "#c4b9f8",
      lineColor: "#9585e8",
      secondaryColor: "#f6f5fb",
      tertiaryColor: "#ffffff",
      mainBkg: "#ede9fb",
      nodeBorder: "#9585e8",
      nodeTextColor: "#18152e",
      edgeLabelBackground: "#f6f5fb",
      fontSize: "13px",
    },
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif',
  });
}

export function MermaidDiagram({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    ensureInit();
    setError(false);
    const id = `mermaid-${Math.random().toString(36).slice(2, 9)}`;
    mermaid
      .render(id, code)
      .then(({ svg }) => {
        if (ref.current) ref.current.innerHTML = svg;
      })
      .catch(() => setError(true));
  }, [code]);

  if (error) {
    return (
      <pre className="mermaid-fallback">
        <code>{code}</code>
      </pre>
    );
  }

  return (
    <div
      ref={ref}
      className="mermaid-diagram"
    />
  );
}
