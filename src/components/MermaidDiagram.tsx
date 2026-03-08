import { useEffect, useRef, useState, useCallback } from "react";
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
      lineColor: "#b5a8f0",
      secondaryColor: "#f6f5fb",
      tertiaryColor: "#ffffff",
      mainBkg: "#ede9fb",
      nodeBorder: "#c4b9f8",
      nodeTextColor: "#18152e",
      edgeLabelBackground: "#f8f7ff",
      fontSize: "13px",
    },
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif',
  });
}

interface Transform { scale: number; x: number; y: number }

export function MermaidDiagram({ code }: { code: string }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  const [displayScale, setDisplayScale] = useState(1);
  const tf = useRef<Transform>({ scale: 1, x: 0, y: 0 });
  const dragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  // Apply transform to DOM directly (no re-render lag)
  const commit = useCallback(() => {
    if (!innerRef.current) return;
    const { scale, x, y } = tf.current;
    innerRef.current.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    setDisplayScale(Math.round(scale * 100));
  }, []);

  const reset = useCallback(() => {
    tf.current = { scale: 1, x: 0, y: 0 };
    commit();
  }, [commit]);

  // Render mermaid SVG
  useEffect(() => {
    if (!innerRef.current) return;
    ensureInit();
    setError(false);
    reset();
    const id = `mermaid-${Math.random().toString(36).slice(2, 9)}`;
    mermaid
      .render(id, code)
      .then(({ svg }) => {
        if (!innerRef.current) return;
        innerRef.current.innerHTML = svg;
        // Make SVG fill the container responsively
        const svgEl = innerRef.current.querySelector("svg");
        if (svgEl) {
          svgEl.style.width = "100%";
          svgEl.style.height = "auto";
          svgEl.style.maxWidth = "none";
        }
      })
      .catch(() => setError(true));
  }, [code, reset]);

  // Pinch-to-zoom (trackpad) — zoom toward cursor
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();

      const rect = el.getBoundingClientRect();
      // Mouse position relative to container center
      const ox = e.clientX - rect.left - rect.width / 2;
      const oy = e.clientY - rect.top - rect.height / 2;

      const factor = e.deltaY < 0 ? 1.1 : 0.92;
      const oldScale = tf.current.scale;
      const newScale = Math.min(Math.max(oldScale * factor, 0.15), 6);
      const ratio = newScale / oldScale;

      tf.current = {
        scale: newScale,
        x: ox - ratio * (ox - tf.current.x),
        y: oy - ratio * (oy - tf.current.y),
      };
      commit();
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [commit]);

  // Drag to pan
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    e.preventDefault();
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      tf.current = {
        ...tf.current,
        x: tf.current.x + (e.clientX - lastMouse.current.x),
        y: tf.current.y + (e.clientY - lastMouse.current.y),
      };
      lastMouse.current = { x: e.clientX, y: e.clientY };
      commit();
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [commit]);

  if (error) {
    return <pre className="mermaid-fallback"><code>{code}</code></pre>;
  }

  const FADE = "rgba(255,255,255,0)";
  const BG = "#ffffff";

  return (
    <div
      ref={wrapperRef}
      onMouseDown={onMouseDown}
      onDoubleClick={reset}
      style={{
        position: "relative",
        height: 420,
        overflow: "hidden",
        background: BG,
        borderRadius: 16,
        boxShadow: "0 0 0 1px rgba(114,96,220,0.1), 0 4px 24px rgba(114,96,220,0.07)",
        cursor: "grab",
        userSelect: "none",
        margin: "2rem 0",
      }}
    >
      {/* Edge fade overlays */}
      {[
        { top: 0, left: 0, right: 0, height: 48, background: `linear-gradient(to bottom, ${BG}, ${FADE})` },
        { bottom: 0, left: 0, right: 0, height: 48, background: `linear-gradient(to top, ${BG}, ${FADE})` },
        { top: 0, bottom: 0, left: 0, width: 40, background: `linear-gradient(to right, ${BG}, ${FADE})` },
        { top: 0, bottom: 0, right: 0, width: 40, background: `linear-gradient(to left, ${BG}, ${FADE})` },
      ].map((s, i) => (
        <div key={i} style={{ position: "absolute", pointerEvents: "none", zIndex: 5, ...s }} />
      ))}

      {/* Control pill */}
      <div
        style={{
          position: "absolute", bottom: 12, right: 12, zIndex: 10,
          display: "flex", alignItems: "center",
          background: "rgba(255,255,255,0.88)",
          backdropFilter: "blur(8px)",
          border: "1px solid rgba(114,96,220,0.13)",
          borderRadius: 20,
          boxShadow: "0 1px 8px rgba(0,0,0,0.07)",
          padding: "2px 4px",
          gap: 0,
        }}
      >
        <span style={{
          fontSize: 10, color: "var(--color-text-muted)",
          fontVariantNumeric: "tabular-nums", minWidth: 30,
          textAlign: "center", padding: "0 4px", opacity: 0.65,
        }}>
          {displayScale}%
        </span>
        <div style={{ width: 1, height: 12, background: "rgba(114,96,220,0.15)", margin: "0 2px", flexShrink: 0 }} />
        {[
          { label: "+", title: "放大", action: () => { const s = Math.min(tf.current.scale * 1.25, 6); tf.current = { ...tf.current, scale: s }; commit(); } },
          { label: "−", title: "缩小", action: () => { const s = Math.max(tf.current.scale * 0.8, 0.15); tf.current = { ...tf.current, scale: s }; commit(); } },
          { label: "⊙", title: "还原", action: reset },
        ].map(({ label, title, action }) => (
          <button
            key={label}
            title={title}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); action(); }}
            style={{
              width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: label === "⊙" ? 12 : 14, lineHeight: 1,
              background: "transparent", border: "none",
              borderRadius: 14, cursor: "pointer",
              color: "var(--color-text-muted)",
              transition: "background 0.12s, color 0.12s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "rgba(114,96,220,0.1)";
              (e.currentTarget as HTMLElement).style.color = "var(--color-accent)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
              (e.currentTarget as HTMLElement).style.color = "var(--color-text-muted)";
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Diagram */}
      <div
        ref={innerRef}
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transformOrigin: "center center",
          willChange: "transform",
          padding: "32px 48px",
        }}
      />
    </div>
  );
}
