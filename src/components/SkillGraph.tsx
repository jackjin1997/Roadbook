import { useEffect, useRef, useState, useCallback } from "react";
import * as d3 from "d3";
import type { SkillNode, SkillStatus } from "../types";

// ── Color palette ────────────────────────────────────────────────────────────

const CATEGORY_COLORS = [
  "#FF6B35", "#004E89", "#7B2D8E", "#1A936F", "#C5283D",
  "#E9724C", "#3498db", "#9b59b6", "#27ae60", "#f39c12",
];

function categoryColor(categories: string[], cat: string): string {
  const idx = categories.indexOf(cat);
  return CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
}

// ── Types ────────────────────────────────────────────────────────────────────

type NodeKind = "skill" | "sub";

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  category: string;
  priority: "high" | "medium" | "low";
  description: string;
  subSkills: string[];
  radius: number;
  kind: NodeKind;
  parentId?: string;          // for sub-skill nodes
  ring: number;               // 0=center, 1=mid, 2=outer, 3=sub-skill orbit
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  type: "related" | "category" | "sub";
  label?: string;
  curveOffset?: number;
}

// ── Build graph ──────────────────────────────────────────────────────────────

function buildGraph(
  skillTree: SkillNode[],
  expandedIds: Set<string>,
): { nodes: GraphNode[]; links: GraphLink[] } {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const nodeSet = new Map<string, GraphNode>();

  for (const skill of skillTree) {
    const node: GraphNode = {
      id: skill.name,
      name: skill.name,
      category: skill.category,
      priority: skill.priority,
      description: skill.description,
      subSkills: skill.subSkills,
      radius: skill.priority === "high" ? 22 : skill.priority === "medium" ? 14 : 9,
      kind: "skill",
      ring: skill.priority === "high" ? 0 : skill.priority === "medium" ? 1 : 2,
    };
    nodes.push(node);
    nodeSet.set(skill.name, node);
  }

  // Sub-skill satellite nodes (only for expanded parents)
  for (const skill of skillTree) {
    if (!expandedIds.has(skill.name)) continue;
    for (const sub of skill.subSkills) {
      if (nodeSet.has(sub)) continue; // avoid duplicating if it's also a main skill
      const subNode: GraphNode = {
        id: `${skill.name}::${sub}`,
        name: sub,
        category: skill.category,
        priority: "low",
        description: "",
        subSkills: [],
        radius: 5,
        kind: "sub",
        parentId: skill.name,
        ring: 3,
      };
      nodes.push(subNode);
      nodeSet.set(subNode.id, subNode);
      links.push({ source: skill.name, target: subNode.id, type: "sub" });
    }
  }

  // Related concept edges
  for (const skill of skillTree) {
    for (const related of skill.relatedConcepts) {
      if (!nodeSet.has(related)) continue;
      const exists = links.some(
        (l) =>
          (typeof l.source === "string" ? l.source : (l.source as GraphNode).id) === skill.name &&
          (typeof l.target === "string" ? l.target : (l.target as GraphNode).id) === related,
      );
      if (!exists) {
        links.push({ source: skill.name, target: related, type: "related", label: "related" });
      }
    }
  }

  // Category-based chain edges
  const byCategory = new Map<string, GraphNode[]>();
  for (const n of nodes) {
    if (n.kind !== "skill") continue;
    const arr = byCategory.get(n.category) ?? [];
    arr.push(n);
    byCategory.set(n.category, arr);
  }
  for (const group of byCategory.values()) {
    for (let i = 1; i < group.length; i++) {
      const a = group[i - 1].id, b = group[i].id;
      const exists = links.some(
        (l) => {
          const s = typeof l.source === "string" ? l.source : (l.source as GraphNode).id;
          const t = typeof l.target === "string" ? l.target : (l.target as GraphNode).id;
          return (s === a && t === b) || (s === b && t === a);
        },
      );
      if (!exists) links.push({ source: a, target: b, type: "category" });
    }
  }

  // Curve offsets for multi-edges
  const pairCount = new Map<string, number>();
  for (const link of links) {
    const s = typeof link.source === "string" ? link.source : (link.source as GraphNode).id;
    const t = typeof link.target === "string" ? link.target : (link.target as GraphNode).id;
    const key = [s, t].sort().join("||");
    const count = (pairCount.get(key) ?? 0) + 1;
    pairCount.set(key, count);
    link.curveOffset = count > 1 ? (count % 2 === 0 ? count * 15 : -count * 15) : 25;
  }

  return { nodes, links };
}

// ── Bézier helpers ───────────────────────────────────────────────────────────

function curvedPath(sx: number, sy: number, tx: number, ty: number, offset: number): string {
  const mx = (sx + tx) / 2, my = (sy + ty) / 2;
  const dx = tx - sx, dy = ty - sy;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  return `M${sx},${sy} Q${mx + (offset * -dy) / len},${my + (offset * dx) / len} ${tx},${ty}`;
}

function curvedMidpoint(sx: number, sy: number, tx: number, ty: number, offset: number) {
  const mx = (sx + tx) / 2, my = (sy + ty) / 2;
  const dx = tx - sx, dy = ty - sy;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const cx = mx + (offset * -dy) / len, cy = my + (offset * dx) / len;
  return { x: 0.25 * sx + 0.5 * cx + 0.25 * tx, y: 0.25 * sy + 0.5 * cy + 0.25 * ty };
}

// ── Constants ────────────────────────────────────────────────────────────────

const HIGHLIGHT = "#E91E63";

const STATUS_COLORS: Record<SkillStatus, string> = {
  not_started: "transparent", learning: "#FDCB6E", mastered: "#00B894",
};
const NEXT_STATUS: Record<SkillStatus, SkillStatus> = {
  not_started: "learning", learning: "mastered", mastered: "not_started",
};

const RING_COLORS = [
  "rgba(233,30,99,0.06)",   // ring 0 — high (center)
  "rgba(233,30,99,0.03)",   // ring 1 — medium
  "rgba(0,0,0,0.015)",      // ring 2 — low (outer)
];

// ── Component ────────────────────────────────────────────────────────────────

interface SkillGraphProps {
  skillTree: SkillNode[];
  skillProgress?: Record<string, SkillStatus>;
  onStatusChange?: (skillName: string, status: SkillStatus) => void;
}

export function SkillGraph({ skillTree, skillProgress = {}, onStatusChange }: SkillGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showEdgeLabels, setShowEdgeLabels] = useState(true);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => {
      setDimensions({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleBackgroundClick = useCallback(() => setSelectedNode(null), []);

  // ── D3 render ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!svgRef.current || skillTree.length === 0) return;

    const { width, height } = dimensions;
    const cx = width / 2, cy = height / 2;
    const maxR = Math.min(width, height) / 2 - 40;
    const ringRadii = [maxR * 0.18, maxR * 0.45, maxR * 0.75]; // high, medium, low
    const { nodes, links } = buildGraph(skillTree, expandedIds);
    const categories = [...new Set(skillTree.map((s) => s.category))];

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const defs = svg.append("defs");

    // Dot grid pattern
    defs.append("pattern")
      .attr("id", "dot-grid").attr("width", 24).attr("height", 24)
      .attr("patternUnits", "userSpaceOnUse")
      .append("circle").attr("cx", 12).attr("cy", 12).attr("r", 1).attr("fill", "#D0D0D0");

    // Background
    svg.append("rect").attr("width", width).attr("height", height).attr("fill", "#FAFAFA")
      .on("click", () => {
        handleBackgroundClick();
        g.selectAll(".node-circle").attr("stroke", "#fff");
        linkPath.attr("stroke", (d: GraphLink) => d.type === "sub" ? "#bbb" : "#C0C0C0");
      });
    svg.append("rect").attr("width", width).attr("height", height).attr("fill", "url(#dot-grid)")
      .style("pointer-events", "none");

    const g = svg.append("g");

    // Zoom
    svg.call(
      d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.2, 5])
        .on("zoom", (event) => g.attr("transform", event.transform)),
    );

    // ── Archery target rings ─────────────────────────────────────────────────

    const ringGroup = g.append("g").attr("class", "rings");
    for (let i = ringRadii.length - 1; i >= 0; i--) {
      // Fill ring
      ringGroup.append("circle")
        .attr("cx", cx).attr("cy", cy).attr("r", ringRadii[i])
        .attr("fill", RING_COLORS[i]).attr("stroke", "none");
      // Ring border
      ringGroup.append("circle")
        .attr("cx", cx).attr("cy", cy).attr("r", ringRadii[i])
        .attr("fill", "none")
        .attr("stroke", i === 0 ? "rgba(233,30,99,0.15)" : "rgba(0,0,0,0.05)")
        .attr("stroke-width", i === 0 ? 2 : 1)
        .attr("stroke-dasharray", i === 0 ? "none" : "4,4");
    }
    // Ring labels
    const ringLabels = ["High", "Medium", "Low"];
    ringRadii.forEach((r, i) => {
      ringGroup.append("text")
        .attr("x", cx + r - 6).attr("y", cy - 6)
        .attr("fill", i === 0 ? "rgba(233,30,99,0.3)" : "rgba(0,0,0,0.12)")
        .attr("font-size", 9).attr("font-weight", 600)
        .attr("text-anchor", "end")
        .text(ringLabels[i]);
    });

    // Center dot
    ringGroup.append("circle")
      .attr("cx", cx).attr("cy", cy).attr("r", 4)
      .attr("fill", HIGHLIGHT).attr("opacity", 0.3);

    // ── Force simulation with radial constraint ──────────────────────────────

    const simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink<GraphNode, GraphLink>(links).id((d) => d.id)
        .distance((d) => d.type === "sub" ? 50 : 100))
      .force("charge", d3.forceManyBody<GraphNode>().strength((d) =>
        d.kind === "sub" ? -60 : d.priority === "high" ? -350 : d.priority === "medium" ? -200 : -120,
      ))
      .force("collide", d3.forceCollide<GraphNode>().radius((d) => d.radius + (d.kind === "sub" ? 12 : 25)))
      .force("radial", d3.forceRadial<GraphNode>(
        (d) => d.kind === "sub" ? ringRadii[2] + 40 : ringRadii[d.ring] ?? ringRadii[2],
        cx, cy,
      ).strength((d) => d.kind === "sub" ? 0.15 : 0.6))
      .force("x", d3.forceX(cx).strength(0.01))
      .force("y", d3.forceY(cy).strength(0.01));

    // ── Edges ────────────────────────────────────────────────────────────────

    const linkGroup = g.append("g").attr("class", "links");

    const linkPath = linkGroup.selectAll<SVGPathElement, GraphLink>("path")
      .data(links).join("path")
      .attr("fill", "none")
      .attr("stroke", (d) => d.type === "sub" ? "#bbb" : "#C0C0C0")
      .attr("stroke-width", (d) => {
        if (d.type === "sub") return 1;
        const s = typeof d.source === "string" ? nodes.find((n) => n.id === d.source) : d.source as GraphNode;
        const hasPri = s?.priority === "high";
        return hasPri ? 2.2 : d.type === "related" ? 1.5 : 1;
      })
      .attr("stroke-dasharray", (d) => d.type === "sub" ? "4,3" : d.type === "category" ? "6,4" : "none")
      .attr("stroke-opacity", (d) => d.type === "sub" ? 0.6 : 0.7);

    // Edge labels (only for "related" links)
    const edgeLabelGroup = linkGroup
      .selectAll<SVGGElement, GraphLink>("g.edge-label")
      .data(links.filter((l) => l.type === "related" && l.label))
      .join("g").attr("class", "edge-label")
      .style("display", showEdgeLabels ? "block" : "none");

    edgeLabelGroup.append("rect").attr("rx", 3).attr("ry", 3).attr("fill", "rgba(255,255,255,0.92)");
    edgeLabelGroup.append("text")
      .text((d) => d.label ?? "").attr("text-anchor", "middle").attr("dy", "0.35em")
      .attr("font-size", 8).attr("fill", "#888").attr("pointer-events", "none")
      .style("font-family", "system-ui, sans-serif");

    edgeLabelGroup.each(function () {
      const grp = d3.select(this);
      const bbox = (grp.select("text").node() as SVGTextElement)?.getBBox();
      if (bbox) grp.select("rect").attr("x", bbox.x - 3).attr("y", bbox.y - 1).attr("width", bbox.width + 6).attr("height", bbox.height + 2);
    });

    // ── Nodes ────────────────────────────────────────────────────────────────

    const node = g.append("g").attr("class", "nodes")
      .selectAll<SVGGElement, GraphNode>("g").data(nodes).join("g")
      .style("cursor", "pointer")
      .call(
        d3.drag<SVGGElement, GraphNode>()
          .on("start", (event, d) => { d.fx = d.x; d.fy = d.y; (d as any)._ds = { x: event.x, y: event.y }; (d as any)._dragging = false; })
          .on("drag", (event, d) => {
            const ds = (d as any)._ds;
            if (!(d as any)._dragging && Math.hypot(event.x - ds.x, event.y - ds.y) > 3) {
              (d as any)._dragging = true; simulation.alphaTarget(0.3).restart();
            }
            if ((d as any)._dragging) { d.fx = event.x; d.fy = event.y; }
          })
          .on("end", (_, d) => { if ((d as any)._dragging) simulation.alphaTarget(0); d.fx = null; d.fy = null; }),
      );

    // Main circle
    node.append("circle").attr("class", "node-circle")
      .attr("r", (d) => d.radius)
      .attr("fill", (d) => categoryColor(categories, d.category))
      .attr("stroke", "#fff")
      .attr("stroke-width", (d) => d.kind === "sub" ? 1.5 : d.priority === "high" ? 3.5 : 2.5)
      .attr("opacity", (d) => d.kind === "sub" ? 0.65 : d.priority === "low" ? 0.8 : 1);

    // Inner highlight for high priority
    node.each(function (d) {
      if (d.priority !== "high" || d.kind !== "skill") return;
      d3.select(this).append("circle").attr("r", d.radius - 7)
        .attr("fill", "rgba(255,255,255,0.3)").attr("pointer-events", "none");
    });

    // Expand indicator (+ / −) for skill nodes with sub-skills
    node.each(function (d) {
      if (d.kind !== "skill" || d.subSkills.length === 0) return;
      d3.select(this).append("text")
        .attr("class", "expand-indicator")
        .text(expandedIds.has(d.id) ? "−" : "+")
        .attr("x", -d.radius - 2).attr("y", -d.radius - 2)
        .attr("font-size", 11).attr("font-weight", 700)
        .attr("fill", "#888")
        .attr("text-anchor", "middle")
        .attr("pointer-events", "none")
        .style("font-family", "system-ui");
    });

    // Status ring
    node.append("circle").attr("class", "status-ring")
      .attr("r", (d) => d.radius + 3).attr("fill", "none")
      .attr("stroke", (d) => STATUS_COLORS[skillProgress[d.name] ?? "not_started"])
      .attr("stroke-width", 2)
      .attr("stroke-opacity", (d) => (skillProgress[d.name] && skillProgress[d.name] !== "not_started") ? 0.8 : 0);

    // Labels
    node.append("text")
      .text((d) => d.name.length > 18 ? d.name.substring(0, 18) + "…" : d.name)
      .attr("dx", (d) => d.radius + 5)
      .attr("dy", 4)
      .attr("fill", (d) => d.kind === "sub" ? "#888" : "#333")
      .attr("font-size", (d) => d.kind === "sub" ? 9 : d.priority === "high" ? 13 : d.priority === "medium" ? 11 : 10)
      .attr("font-weight", (d) => d.kind === "sub" ? 400 : d.priority === "high" ? 700 : 500)
      .attr("pointer-events", "none")
      .style("font-family", "system-ui, sans-serif");

    // ── Interactions ─────────────────────────────────────────────────────────

    node
      .on("mouseenter", function (_, d) {
        d3.select(this).select<SVGCircleElement>(".node-circle").attr("stroke", "#333").attr("stroke-width", 3);
        // Highlight connected edges
        linkPath.attr("stroke-opacity", (l) =>
          (l.source as GraphNode).id === d.id || (l.target as GraphNode).id === d.id ? 1 : 0.15,
        );
        node.style("opacity", (n) => {
          if (n.id === d.id) return 1;
          return links.some((l) =>
            ((l.source as GraphNode).id === d.id && (l.target as GraphNode).id === n.id) ||
            ((l.target as GraphNode).id === d.id && (l.source as GraphNode).id === n.id),
          ) ? 1 : 0.2;
        });
      })
      .on("mouseleave", function () {
        node.each(function (d) {
          d3.select(this).select<SVGCircleElement>(".node-circle")
            .attr("stroke", "#fff")
            .attr("stroke-width", d.kind === "sub" ? 1.5 : d.priority === "high" ? 3.5 : 2.5);
        });
        linkPath.attr("stroke-opacity", (l) => l.type === "sub" ? 0.6 : 0.7);
        node.style("opacity", 1);
      })
      .on("click", (event, d) => {
        event.stopPropagation();
        if (d.kind === "skill" && d.subSkills.length > 0) {
          toggleExpand(d.id);
        }
        // Highlight
        node.selectAll<SVGCircleElement, GraphNode>(".node-circle").attr("stroke", "#fff");
        linkPath.attr("stroke", (l: GraphLink) => l.type === "sub" ? "#bbb" : "#C0C0C0");
        d3.select(event.currentTarget).select(".node-circle").attr("stroke", HIGHLIGHT).attr("stroke-width", 4);
        linkPath.filter((l) => (l.source as GraphNode).id === d.id || (l.target as GraphNode).id === d.id)
          .attr("stroke", HIGHLIGHT).attr("stroke-width", 2.5);
        setSelectedNode(d);
      })
      .on("dblclick", (event, d) => {
        event.stopPropagation();
        if (!onStatusChange || d.kind === "sub") return;
        const next = NEXT_STATUS[skillProgress[d.name] ?? "not_started"];
        onStatusChange(d.name, next);
        d3.select(event.currentTarget).select(".status-ring")
          .attr("stroke", STATUS_COLORS[next])
          .attr("stroke-opacity", next === "not_started" ? 0 : 0.8);
      });

    // ── Tick ─────────────────────────────────────────────────────────────────

    simulation.on("tick", () => {
      linkPath.attr("d", (d) => {
        const s = d.source as GraphNode, t = d.target as GraphNode;
        if (d.type === "sub") return `M${s.x},${s.y} L${t.x},${t.y}`;
        return curvedPath(s.x!, s.y!, t.x!, t.y!, d.curveOffset ?? 25);
      });

      edgeLabelGroup.attr("transform", (d) => {
        const s = d.source as GraphNode, t = d.target as GraphNode;
        const mid = curvedMidpoint(s.x!, s.y!, t.x!, t.y!, d.curveOffset ?? 25);
        return `translate(${mid.x},${mid.y})`;
      });

      node.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });

    return () => { simulation.stop(); };
  }, [skillTree, dimensions, expandedIds, handleBackgroundClick, showEdgeLabels, skillProgress, onStatusChange]);

  // Edge label visibility
  useEffect(() => {
    if (!svgRef.current) return;
    d3.select(svgRef.current).selectAll(".edge-label")
      .transition().duration(200).style("display", showEdgeLabels ? "block" : "none");
  }, [showEdgeLabels]);

  const categories = [...new Set(skillTree.map((s) => s.category))];

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%", height: "100%", minHeight: 400 }}>
      <svg ref={svgRef} width={dimensions.width} height={dimensions.height} style={{ display: "block" }} />

      {/* Edge labels toggle */}
      <div style={{
        position: "absolute", top: 56, right: 20, display: "flex", alignItems: "center", gap: 10,
        background: "#fff", padding: "8px 14px", borderRadius: 20,
        border: "1px solid #E0E0E0", boxShadow: "0 2px 8px rgba(0,0,0,0.04)", zIndex: 10,
      }}>
        <label style={{ position: "relative", display: "inline-block", width: 40, height: 22, cursor: "pointer" }}>
          <input type="checkbox" checked={showEdgeLabels} onChange={(e) => setShowEdgeLabels(e.target.checked)}
            style={{ opacity: 0, width: 0, height: 0, position: "absolute" }} />
          <span style={{ position: "absolute", cursor: "pointer", inset: 0, backgroundColor: showEdgeLabels ? "#7B2D8E" : "#E0E0E0", borderRadius: 22, transition: "0.3s" }}>
            <span style={{ position: "absolute", height: 16, width: 16, left: showEdgeLabels ? 21 : 3, bottom: 3, backgroundColor: "white", borderRadius: "50%", transition: "0.3s" }} />
          </span>
        </label>
        <span style={{ fontSize: 12, color: "#666" }}>Labels</span>
      </div>

      {/* Category legend */}
      <div style={{
        position: "absolute", bottom: 24, left: 24, background: "rgba(255,255,255,0.95)",
        padding: "12px 16px", borderRadius: 8, border: "1px solid #EAEAEA",
        boxShadow: "0 4px 16px rgba(0,0,0,0.06)", zIndex: 10,
      }}>
        <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: HIGHLIGHT, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>
          Categories
        </span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 14px", maxWidth: 340 }}>
          {categories.map((cat) => (
            <div key={cat} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#555" }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: categoryColor(categories, cat), flexShrink: 0 }} />
              <span style={{ whiteSpace: "nowrap" }}>{cat}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Status + hints legend */}
      <div style={{
        position: "absolute", bottom: 24, right: 20, background: "rgba(255,255,255,0.95)",
        padding: "10px 14px", borderRadius: 8, border: "1px solid #EAEAEA",
        boxShadow: "0 4px 16px rgba(0,0,0,0.06)", fontSize: 11, display: "flex", flexDirection: "column", gap: 8, zIndex: 10,
      }}>
        <div style={{ display: "flex", gap: 12 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", border: "2px solid #FDCB6E" }} />
            <span style={{ color: "#555" }}>Learning</span>
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", border: "2px solid #00B894" }} />
            <span style={{ color: "#555" }}>Mastered</span>
          </span>
        </div>
        <div style={{ color: "#999", fontSize: 10, lineHeight: 1.4 }}>
          Click to expand sub-skills &middot; Dbl-click to toggle status
        </div>
      </div>

      {/* Detail panel */}
      {selectedNode && selectedNode.kind === "skill" && (
        <div style={{
          position: "absolute", top: 60, right: 20, width: 310, maxHeight: "calc(100% - 100px)",
          background: "#fff", border: "1px solid #EAEAEA", borderRadius: 10,
          boxShadow: "0 8px 32px rgba(0,0,0,0.1)", overflow: "hidden",
          fontFamily: "system-ui, sans-serif", fontSize: 13, zIndex: 20, display: "flex", flexDirection: "column",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", background: "#FAFAFA", borderBottom: "1px solid #EEE", flexShrink: 0 }}>
            <span style={{ fontWeight: 600, color: "#333", fontSize: 14 }}>Node Details</span>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ padding: "3px 10px", borderRadius: 12, fontSize: 10, fontWeight: 500, background: categoryColor(categories, selectedNode.category), color: "#fff" }}>
                {selectedNode.category}
              </span>
              <button onClick={() => setSelectedNode(null)} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#999", lineHeight: 1, padding: 0 }}>×</button>
            </div>
          </div>
          <div style={{ padding: 14, overflowY: "auto", flex: 1 }}>
            <div style={{ marginBottom: 10 }}>
              <span style={{ color: "#888", fontSize: 11, fontWeight: 500 }}>Name: </span>
              <span style={{ color: "#333", fontWeight: 600 }}>{selectedNode.name}</span>
            </div>
            <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ color: "#888", fontSize: 11, fontWeight: 500 }}>Priority: </span>
              <span style={{
                padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 500,
                background: selectedNode.priority === "high" ? "#FDECEA" : selectedNode.priority === "medium" ? "#FFF8E1" : "#E8F5E9",
                color: selectedNode.priority === "high" ? "#C62828" : selectedNode.priority === "medium" ? "#F57F17" : "#2E7D32",
              }}>{selectedNode.priority}</span>
            </div>
            {selectedNode.description && (
              <div style={{ marginBottom: 12 }}>
                <span style={{ display: "block", color: "#888", fontSize: 11, fontWeight: 500, marginBottom: 4 }}>Summary:</span>
                <p style={{ margin: 0, lineHeight: 1.6, color: "#333", fontSize: 12 }}>{selectedNode.description}</p>
              </div>
            )}
            {selectedNode.subSkills.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <span style={{ display: "block", color: "#888", fontSize: 11, fontWeight: 500, marginBottom: 6 }}>
                  Sub-skills ({selectedNode.subSkills.length}):
                </span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {selectedNode.subSkills.map((s) => (
                    <span key={s} style={{ padding: "3px 8px", borderRadius: 5, background: "#F5F5F5", fontSize: 10, color: "#555", border: "1px solid #EAEAEA" }}>{s}</span>
                  ))}
                </div>
              </div>
            )}
            {onStatusChange && (
              <div>
                <span style={{ display: "block", color: "#888", fontSize: 11, fontWeight: 500, marginBottom: 6 }}>Status:</span>
                <div style={{ display: "flex", gap: 5 }}>
                  {(["not_started", "learning", "mastered"] as SkillStatus[]).map((s) => {
                    const current = skillProgress[selectedNode.name] ?? "not_started";
                    const active = current === s;
                    const labels: Record<SkillStatus, string> = { not_started: "Not Started", learning: "Learning", mastered: "Mastered" };
                    const colors: Record<SkillStatus, string> = { not_started: "#888", learning: "#F57F17", mastered: "#2E7D32" };
                    return (
                      <button key={s} onClick={() => onStatusChange(selectedNode.name, s)} style={{
                        padding: "4px 12px", borderRadius: 5, fontSize: 10, fontWeight: active ? 600 : 400,
                        border: `1.5px solid ${active ? colors[s] : "#E0E0E0"}`,
                        background: active ? `${colors[s]}15` : "transparent",
                        color: active ? colors[s] : "#bbb", cursor: "pointer", transition: "all 0.15s",
                      }}>{labels[s]}</button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
