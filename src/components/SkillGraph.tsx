import { useEffect, useRef, useState, useCallback } from "react";
import * as d3 from "d3";
import type { SkillNode, SkillStatus } from "../types";

// ── Color palette by category ────────────────────────────────────────────────

const CATEGORY_COLORS = [
  "#6C5CE7", "#00B894", "#E17055", "#0984E3", "#D63031",
  "#FDCB6E", "#A29BFE", "#00CEC9", "#E84393", "#636E72",
];

function categoryColor(categories: string[], cat: string): string {
  const idx = categories.indexOf(cat);
  return CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
}

// ── Types ────────────────────────────────────────────────────────────────────

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  category: string;
  priority: "high" | "medium" | "low";
  description: string;
  subSkills: string[];
  radius: number;
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  type: "related" | "subskill";
}

// ── Build graph from skillTree ───────────────────────────────────────────────

function buildGraph(skillTree: SkillNode[]): { nodes: GraphNode[]; links: GraphLink[] } {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const nodeMap = new Map<string, GraphNode>();

  for (const skill of skillTree) {
    const node: GraphNode = {
      id: skill.name,
      name: skill.name,
      category: skill.category,
      priority: skill.priority,
      description: skill.description,
      subSkills: skill.subSkills,
      radius: skill.priority === "high" ? 14 : skill.priority === "medium" ? 10 : 7,
    };
    nodes.push(node);
    nodeMap.set(skill.name, node);
  }

  // Related concept edges
  for (const skill of skillTree) {
    for (const related of skill.relatedConcepts) {
      if (nodeMap.has(related)) {
        // Avoid duplicate edges
        const exists = links.some(
          (l) =>
            (typeof l.source === "string" ? l.source : (l.source as GraphNode).id) === skill.name &&
            (typeof l.target === "string" ? l.target : (l.target as GraphNode).id) === related,
        );
        if (!exists) {
          links.push({ source: skill.name, target: related, type: "related" });
        }
      }
    }
  }

  // Category-based edges: lightly connect nodes in same category
  const byCategory = new Map<string, GraphNode[]>();
  for (const n of nodes) {
    const arr = byCategory.get(n.category) ?? [];
    arr.push(n);
    byCategory.set(n.category, arr);
  }
  for (const group of byCategory.values()) {
    for (let i = 1; i < group.length; i++) {
      const exists = links.some(
        (l) =>
          ((typeof l.source === "string" ? l.source : (l.source as GraphNode).id) === group[i - 1].id &&
           (typeof l.target === "string" ? l.target : (l.target as GraphNode).id) === group[i].id) ||
          ((typeof l.source === "string" ? l.source : (l.source as GraphNode).id) === group[i].id &&
           (typeof l.target === "string" ? l.target : (l.target as GraphNode).id) === group[i - 1].id),
      );
      if (!exists) {
        links.push({ source: group[i - 1].id, target: group[i].id, type: "subskill" });
      }
    }
  }

  return { nodes, links };
}

// ── Component ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<SkillStatus, string> = {
  not_started: "transparent",
  learning: "#FDCB6E",
  mastered: "#00B894",
};

const NEXT_STATUS: Record<SkillStatus, SkillStatus> = {
  not_started: "learning",
  learning: "mastered",
  mastered: "not_started",
};

interface SkillGraphProps {
  skillTree: SkillNode[];
  skillProgress?: Record<string, SkillStatus>;
  onStatusChange?: (skillName: string, status: SkillStatus) => void;
}

export function SkillGraph({ skillTree, skillProgress = {}, onStatusChange }: SkillGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });

  // Observe container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => {
      setDimensions({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const handleBackgroundClick = useCallback(() => setSelectedNode(null), []);

  useEffect(() => {
    if (!svgRef.current || skillTree.length === 0) return;

    const { width, height } = dimensions;
    const { nodes, links } = buildGraph(skillTree);
    const categories = [...new Set(skillTree.map((s) => s.category))];

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    // Dot-grid background
    const defs = svg.append("defs");
    defs
      .append("pattern")
      .attr("id", "dot-grid")
      .attr("width", 24)
      .attr("height", 24)
      .attr("patternUnits", "userSpaceOnUse")
      .append("circle")
      .attr("cx", 12)
      .attr("cy", 12)
      .attr("r", 1)
      .attr("fill", "rgba(0,0,0,0.08)");

    svg
      .append("rect")
      .attr("width", width)
      .attr("height", height)
      .attr("fill", "url(#dot-grid)")
      .on("click", handleBackgroundClick);

    // Container for zoom
    const g = svg.append("g");

    // Zoom behavior
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 5])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });
    svg.call(zoom);

    // Force simulation
    const simulation = d3
      .forceSimulation(nodes)
      .force(
        "link",
        d3
          .forceLink<GraphNode, GraphLink>(links)
          .id((d) => d.id)
          .distance(100),
      )
      .force("charge", d3.forceManyBody().strength(-350))
      .force("collide", d3.forceCollide<GraphNode>().radius((d) => d.radius + 20))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("x", d3.forceX(width / 2).strength(0.04))
      .force("y", d3.forceY(height / 2).strength(0.04));

    // Links
    const link = g
      .append("g")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", "#C8C8D0")
      .attr("stroke-width", (d) => (d.type === "related" ? 1.5 : 1))
      .attr("stroke-opacity", (d) => (d.type === "related" ? 0.6 : 0.3))
      .attr("stroke-dasharray", (d) => (d.type === "subskill" ? "4,4" : "none"));

    // Node groups
    const node = g
      .append("g")
      .selectAll<SVGGElement, GraphNode>("g")
      .data(nodes)
      .join("g")
      .style("cursor", "pointer")
      .call(
        d3
          .drag<SVGGElement, GraphNode>()
          .on("start", (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          }),
      );

    // Node circles
    node
      .append("circle")
      .attr("r", (d) => d.radius)
      .attr("fill", (d) => categoryColor(categories, d.category))
      .attr("stroke", "#fff")
      .attr("stroke-width", 2.5)
      .attr("filter", "drop-shadow(0 1px 3px rgba(0,0,0,0.12))");

    // Node labels
    node
      .append("text")
      .text((d) => d.name)
      .attr("dy", (d) => d.radius + 14)
      .attr("text-anchor", "middle")
      .attr("fill", "var(--color-text, #333)")
      .attr("font-size", (d) => (d.priority === "high" ? 11 : 10))
      .attr("font-weight", (d) => (d.priority === "high" ? 600 : 400))
      .attr("pointer-events", "none");

    // Status ring (learning=yellow, mastered=green)
    node
      .append("circle")
      .attr("class", "status-ring")
      .attr("r", (d) => d.radius + 4)
      .attr("fill", "none")
      .attr("stroke", (d) => STATUS_COLORS[skillProgress[d.name] ?? "not_started"])
      .attr("stroke-width", 2.5)
      .attr("stroke-opacity", (d) => (skillProgress[d.name] && skillProgress[d.name] !== "not_started") ? 0.8 : 0);

    // Hover + click
    node
      .on("mouseover", function (_, d) {
        d3.select(this).select("circle").attr("stroke", "#333").attr("stroke-width", 3);
        // Highlight connected edges
        link
          .attr("stroke", (l) =>
            (l.source as GraphNode).id === d.id || (l.target as GraphNode).id === d.id ? "#6C5CE7" : "#C8C8D0",
          )
          .attr("stroke-width", (l) =>
            (l.source as GraphNode).id === d.id || (l.target as GraphNode).id === d.id ? 2.5 : l.type === "related" ? 1.5 : 1,
          )
          .attr("stroke-opacity", (l) =>
            (l.source as GraphNode).id === d.id || (l.target as GraphNode).id === d.id ? 0.9 : l.type === "related" ? 0.6 : 0.3,
          );
      })
      .on("mouseout", function () {
        d3.select(this)
          .select("circle")
          .attr("stroke", "#fff")
          .attr("stroke-width", 2.5);
        link
          .attr("stroke", "#C8C8D0")
          .attr("stroke-width", (l) => (l.type === "related" ? 1.5 : 1))
          .attr("stroke-opacity", (l) => (l.type === "related" ? 0.6 : 0.3));
      })
      .on("click", (event, d) => {
        event.stopPropagation();
        setSelectedNode(d);
      })
      .on("dblclick", (event, d) => {
        event.stopPropagation();
        if (!onStatusChange) return;
        const current = skillProgress[d.name] ?? "not_started";
        const next = NEXT_STATUS[current];
        onStatusChange(d.name, next);
        // Update ring immediately
        d3.select(event.currentTarget).select(".status-ring")
          .attr("stroke", STATUS_COLORS[next])
          .attr("stroke-opacity", next === "not_started" ? 0 : 0.8);
      });

    // Tick
    simulation.on("tick", () => {
      link
        .attr("x1", (d) => (d.source as GraphNode).x!)
        .attr("y1", (d) => (d.source as GraphNode).y!)
        .attr("x2", (d) => (d.target as GraphNode).x!)
        .attr("y2", (d) => (d.target as GraphNode).y!);

      node.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });

    return () => {
      simulation.stop();
    };
  }, [skillTree, dimensions, handleBackgroundClick]);

  const categories = [...new Set(skillTree.map((s) => s.category))];

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%", height: "100%", minHeight: 400 }}>
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        style={{ display: "block", background: "var(--color-surface, #fafafa)" }}
      />

      {/* Legend */}
      <div
        style={{
          position: "absolute",
          bottom: 16,
          left: 16,
          background: "rgba(255,255,255,0.85)",
          backdropFilter: "blur(8px)",
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 10,
          padding: "8px 12px",
          fontSize: 10,
          display: "flex",
          flexWrap: "wrap",
          gap: "6px 14px",
          maxWidth: 320,
        }}
      >
        {categories.map((cat) => (
          <span key={cat} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: categoryColor(categories, cat),
                display: "inline-block",
              }}
            />
            {cat}
          </span>
        ))}
      </div>

      {/* Detail panel */}
      {selectedNode && (
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            width: 280,
            height: "100%",
            background: "rgba(255,255,255,0.95)",
            backdropFilter: "blur(12px)",
            borderLeft: "1px solid rgba(0,0,0,0.08)",
            padding: "20px 16px",
            overflowY: "auto",
            fontSize: 12,
          }}
        >
          <button
            onClick={() => setSelectedNode(null)}
            style={{
              position: "absolute",
              top: 10,
              right: 12,
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 16,
              color: "var(--color-text-muted, #999)",
            }}
          >
            ×
          </button>
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: categoryColor(categories, selectedNode.category),
              marginBottom: 8,
            }}
          />
          <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 600 }}>{selectedNode.name}</h3>
          <p style={{ margin: "0 0 12px", color: "var(--color-text-muted, #888)", fontSize: 11 }}>
            {selectedNode.category}
            <span
              style={{
                marginLeft: 8,
                padding: "1px 6px",
                borderRadius: 4,
                fontSize: 10,
                background:
                  selectedNode.priority === "high"
                    ? "#ffe0e0"
                    : selectedNode.priority === "medium"
                      ? "#fff3d0"
                      : "#e0f0e0",
                color:
                  selectedNode.priority === "high"
                    ? "#c00"
                    : selectedNode.priority === "medium"
                      ? "#a67c00"
                      : "#2a7a2a",
              }}
            >
              {selectedNode.priority}
            </span>
          </p>
          <p style={{ margin: "0 0 14px", lineHeight: 1.5, color: "var(--color-text, #333)" }}>
            {selectedNode.description}
          </p>
          {selectedNode.subSkills.length > 0 && (
            <>
              <p style={{ margin: "0 0 6px", fontWeight: 600, fontSize: 11, color: "var(--color-text-muted, #888)" }}>
                Sub-skills
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 14 }}>
                {selectedNode.subSkills.map((s) => (
                  <span
                    key={s}
                    style={{
                      padding: "2px 8px",
                      borderRadius: 6,
                      background: "var(--color-surface-hover, #f0f0f0)",
                      fontSize: 10,
                    }}
                  >
                    {s}
                  </span>
                ))}
              </div>
            </>
          )}
          {/* Status toggle */}
          {onStatusChange && (
            <div style={{ marginTop: 14 }}>
              <p style={{ margin: "0 0 6px", fontWeight: 600, fontSize: 11, color: "var(--color-text-muted, #888)" }}>
                Status
              </p>
              <div style={{ display: "flex", gap: 4 }}>
                {(["not_started", "learning", "mastered"] as SkillStatus[]).map((s) => {
                  const current = skillProgress[selectedNode.name] ?? "not_started";
                  const isActive = current === s;
                  const labels: Record<SkillStatus, string> = { not_started: "Not Started", learning: "Learning", mastered: "Mastered" };
                  const colors: Record<SkillStatus, string> = { not_started: "#888", learning: "#e6a000", mastered: "#00a86b" };
                  return (
                    <button
                      key={s}
                      onClick={() => onStatusChange(selectedNode.name, s)}
                      style={{
                        padding: "3px 10px",
                        borderRadius: 6,
                        fontSize: 10,
                        fontWeight: isActive ? 600 : 400,
                        border: `1.5px solid ${isActive ? colors[s] : "rgba(0,0,0,0.1)"}`,
                        background: isActive ? `${colors[s]}18` : "transparent",
                        color: isActive ? colors[s] : "var(--color-text-muted, #888)",
                        cursor: "pointer",
                      }}
                    >
                      {labels[s]}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
