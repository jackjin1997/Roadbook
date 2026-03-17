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
      primaryColor: "#F5F5F5",
      primaryTextColor: "#1a1a1a",
      primaryBorderColor: "#E0E0E0",
      lineColor: "#C0C0C0",
      secondaryColor: "#FAFAFA",
      tertiaryColor: "#ffffff",
      mainBkg: "#F5F5F5",
      nodeBorder: "#E0E0E0",
      nodeTextColor: "#1a1a1a",
      edgeLabelBackground: "#fff",
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
      e.preventDefault();

      if (e.ctrlKey) {
        // Pinch-to-zoom — zoom toward cursor
        const rect = el.getBoundingClientRect();
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
      } else {
        // Two-finger scroll — pan
        tf.current = {
          ...tf.current,
          x: tf.current.x - e.deltaX,
          y: tf.current.y - e.deltaY,
        };
      }
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

  // Section tint — MiroFish style
  const TINT = "#FAFAFA";
  const TINT0 = "rgba(250,250,250,0)";

  return (
    <div
      ref={wrapperRef}
      onMouseDown={onMouseDown}
      onDoubleClick={reset}
      style={{
        position: "relative",
        height: "min(460px, 60vh)",
        overflow: "hidden",
        background: TINT,
        // Break out of prose padding to span full content width
        margin: "2rem -1rem",
        borderTop: "1px solid rgba(0,0,0,0.06)",
        borderBottom: "1px solid rgba(0,0,0,0.06)",
        cursor: "grab",
        userSelect: "none",
      }}
    >
      {/* Section label */}
      <div style={{
        position: "absolute", top: 0, left: 0, zIndex: 10,
        padding: "10px 20px",
        fontSize: 9, fontWeight: 700, letterSpacing: "0.14em",
        textTransform: "uppercase", color: "rgba(0,0,0,0.2)",
        pointerEvents: "none", lineHeight: 1,
      }}>
        路线概览
      </div>

      {/* Left / right edge fades */}
      <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 56,
        background: `linear-gradient(to right, ${TINT}, ${TINT0})`,
        pointerEvents: "none", zIndex: 5 }} />
      <div style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: 56,
        background: `linear-gradient(to left, ${TINT}, ${TINT0})`,
        pointerEvents: "none", zIndex: 5 }} />

      {/* Control pill */}
      <div style={{
        position: "absolute", bottom: 14, right: 16, zIndex: 10,
        display: "flex", alignItems: "center",
        background: "rgba(255,255,255,0.75)",
        backdropFilter: "blur(10px)",
        border: "1px solid rgba(0,0,0,0.06)",
        borderRadius: 20,
        boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
        padding: "2px 4px",
      }}>
        <span style={{
          fontSize: 10, color: "var(--color-text-muted)",
          fontVariantNumeric: "tabular-nums", minWidth: 30,
          textAlign: "center", padding: "0 4px", opacity: 0.6,
        }}>
          {displayScale}%
        </span>
        <div style={{ width: 1, height: 12, background: "rgba(0,0,0,0.08)", margin: "0 2px" }} />
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
              (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.06)";
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
          padding: "36px 56px",
        }}
      />
    </div>
  );
}
