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

  return (
    <div
      ref={wrapperRef}
      onMouseDown={onMouseDown}
      onDoubleClick={reset}
      style={{
        position: "relative",
        height: 360,
        overflow: "hidden",
        background: "#faf9fe",
        border: "1px solid var(--color-border)",
        borderRadius: 12,
        cursor: "grab",
        userSelect: "none",
        margin: "1.75rem 0",
      }}
    >
      {/* Zoom controls */}
      <div style={{
        position: "absolute", top: 10, right: 10, zIndex: 10,
        display: "flex", alignItems: "center", gap: 4,
      }}>
        <span style={{
          fontSize: 10, color: "var(--color-text-muted)", opacity: 0.6,
          fontVariantNumeric: "tabular-nums", minWidth: 32, textAlign: "right",
        }}>
          {displayScale}%
        </span>
        {[
          { label: "+", action: () => { const s = Math.min(tf.current.scale * 1.25, 6); tf.current = { ...tf.current, scale: s }; commit(); } },
          { label: "−", action: () => { const s = Math.max(tf.current.scale * 0.8, 0.15); tf.current = { ...tf.current, scale: s }; commit(); } },
          { label: "⊙", action: reset },
        ].map(({ label, action }) => (
          <button
            key={label}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); action(); }}
            style={{
              width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: label === "⊙" ? 13 : 15, lineHeight: 1,
              background: "var(--color-surface)", border: "1px solid var(--color-border)",
              borderRadius: 6, cursor: "pointer", color: "var(--color-text-muted)",
              transition: "border-color 0.1s, color 0.1s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "var(--color-accent)";
              (e.currentTarget as HTMLElement).style.color = "var(--color-accent)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "var(--color-border)";
              (e.currentTarget as HTMLElement).style.color = "var(--color-text-muted)";
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Hint */}
      <div style={{
        position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)",
        fontSize: 10, color: "var(--color-text-muted)", opacity: 0.4,
        pointerEvents: "none", whiteSpace: "nowrap",
      }}>
        捏合缩放 · 拖拽平移 · 双击还原
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
          padding: "24px 40px",
        }}
      />
    </div>
  );
}
