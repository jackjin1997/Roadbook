import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import * as d3 from "d3";
import type { SkillNode, SkillStatus, SkillProgressEntry } from "../types";

// ── Constants ────────────────────────────────────────────────────────────────

const GRAPH_THEMES = {
  dark: {
    categoryColors: ["#FF6B6B","#4ECDC4","#A78BFA","#FF9FF3","#6C5CE7","#74B9FF","#55EFC4","#FF7675","#FFEAA7","#FFE66D"],
    highlight: "#A78BFA",
    statusColors: { not_started: "transparent", learning: "#FFE66D", mastered: "#55EFC4" } as Record<string, string>,
    regionGlow: 0.04,
    labelColor: "#F0F0F5",
    labelMuted: "#9090A8",
    linkStroke: "rgba(255,255,255,0.12)",
    linkStrokeSub: "rgba(255,255,255,0.08)",
    nodeStroke: "rgba(255,255,255,0.2)",
    edgeLabelBg: "rgba(10,10,18,0.85)",
    edgeLabelColor: "#9090A8",
    legendBg: "rgba(10,10,18,0.85)",
    legendBorder: "rgba(255,255,255,0.08)",
    legendText: "#9090A8",
    pendingFill: "rgba(255,255,255,0.08)",
    pendingStroke: "rgba(255,255,255,0.15)",
    background: "#0A0A12",
  },
  light: {
    categoryColors: ["#FF8A80","#5CD6C8","#B39DDB","#F8BBD0","#9575CD","#81D4FA","#69F0AE","#FFAB91","#FFE0B2","#FFD54F"],
    highlight: "#9575CD",
    statusColors: { not_started: "transparent", learning: "#FFD54F", mastered: "#69F0AE" } as Record<string, string>,
    regionGlow: 0.04,
    labelColor: "#2D2016",
    labelMuted: "#9E8B76",
    linkStroke: "rgba(200,160,100,0.2)",
    linkStrokeSub: "rgba(200,160,100,0.15)",
    nodeStroke: "rgba(255,255,255,0.7)",
    edgeLabelBg: "rgba(255,251,245,0.92)",
    edgeLabelColor: "#9E8B76",
    legendBg: "rgba(255,251,245,0.95)",
    legendBorder: "rgba(200,160,100,0.15)",
    legendText: "#9E8B76",
    pendingFill: "#FFF3E8",
    pendingStroke: "#E8D5C0",
    background: "#FFFBF5",
  },
};

type GraphTheme = typeof GRAPH_THEMES.dark;

const TRANSITION_MS = 250;

const NEXT_STATUS: Record<SkillStatus, SkillStatus> = {
  not_started: "learning", learning: "mastered", mastered: "not_started",
};

/** Resolve a skillProgress value (old string or new SkillProgressEntry) to SkillStatus. */
function resolveStatus(val: SkillStatus | SkillProgressEntry | undefined): SkillStatus {
  if (!val) return "not_started";
  if (typeof val === "string") return val;
  return val.status;
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
  kind: "skill" | "sub";
  parentId?: string;
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  type: "related" | "category" | "sub";
  label?: string;
  curveOffset?: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function categoryColor(categories: string[], cat: string, colors: GraphTheme): string {
  return colors.categoryColors[categories.indexOf(cat) % colors.categoryColors.length];
}

function linkNodeId(end: string | number | GraphNode): string {
  if (typeof end === "string") return end;
  if (typeof end === "number") return String(end);
  return end.id;
}

function nodeStrokeWidth(d: GraphNode): number {
  return d.kind === "sub" ? 1.5 : d.priority === "high" ? 3.5 : 2.5;
}

function defaultLinkStroke(d: GraphLink, colors: GraphTheme): string {
  return d.type === "sub" ? colors.linkStrokeSub : colors.linkStroke;
}

function defaultLinkOpacity(d: GraphLink): number {
  return d.type === "sub" ? 0.6 : 0.7;
}

/** Collect IDs of a node and its direct neighbors. */
function getConnectedIds(nodeId: string, links: GraphLink[]): Set<string> {
  const ids = new Set<string>([nodeId]);
  for (const l of links) {
    const sId = linkNodeId(l.source as GraphNode);
    const tId = linkNodeId(l.target as GraphNode);
    if (sId === nodeId) ids.add(tId);
    if (tId === nodeId) ids.add(sId);
  }
  return ids;
}

function isLinkedTo(link: GraphLink, nodeId: string): boolean {
  return (link.source as GraphNode).id === nodeId || (link.target as GraphNode).id === nodeId;
}

// ── Bézier ───────────────────────────────────────────────────────────────────

function controlPoint(sx: number, sy: number, tx: number, ty: number, offset: number) {
  const mx = (sx + tx) / 2, my = (sy + ty) / 2;
  const dx = tx - sx, dy = ty - sy;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  return { x: mx + (offset * -dy) / len, y: my + (offset * dx) / len };
}

function curvedPath(sx: number, sy: number, tx: number, ty: number, offset: number): string {
  const cp = controlPoint(sx, sy, tx, ty, offset);
  return `M${sx},${sy} Q${cp.x},${cp.y} ${tx},${ty}`;
}

function curvedMidpoint(sx: number, sy: number, tx: number, ty: number, offset: number) {
  const cp = controlPoint(sx, sy, tx, ty, offset);
  return { x: 0.25 * sx + 0.5 * cp.x + 0.25 * tx, y: 0.25 * sy + 0.5 * cp.y + 0.25 * ty };
}

// ── Category territory positions ─────────────────────────────────────────────

/**
 * Distribute category centers across the full canvas rectangle in a grid-like
 * pattern so each category "owns" a visible territory — like regions on a map.
 */
function categoryPositions(
  categories: string[], cx: number, cy: number, width: number, height: number,
): Map<string, { x: number; y: number }> {
  const map = new Map<string, { x: number; y: number }>();
  const n = categories.length;
  if (n === 0) return map;
  if (n === 1) { map.set(categories[0], { x: cx, y: cy }); return map; }

  // Determine grid dimensions that best fill the canvas rectangle
  const aspect = width / height;
  let cols = Math.round(Math.sqrt(n * aspect));
  let rows = Math.ceil(n / cols);
  // Ensure we have enough cells
  if (cols * rows < n) cols = Math.ceil(n / rows);

  // Margins: keep 15% padding on each side so nodes don't clip
  const padX = width * 0.15, padY = height * 0.15;
  const usableW = width - 2 * padX;
  const usableH = height - 2 * padY;
  const cellW = cols > 1 ? usableW / (cols - 1) : 0;
  const cellH = rows > 1 ? usableH / (rows - 1) : 0;
  const startX = padX + (cols === 1 ? usableW / 2 : 0);
  const startY = padY + (rows === 1 ? usableH / 2 : 0);

  for (let i = 0; i < n; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    // Offset odd rows slightly for a more organic, hex-grid feel
    const hexShift = rows > 1 && row % 2 === 1 ? cellW * 0.3 : 0;
    map.set(categories[i], {
      x: startX + col * cellW + hexShift,
      y: startY + row * cellH,
    });
  }
  return map;
}

// ── Build graph ──────────────────────────────────────────────────────────────

function buildGraph(skillTree: SkillNode[], expandedIds: Set<string>) {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const nodeSet = new Map<string, GraphNode>();

  for (const skill of skillTree) {
    const node: GraphNode = {
      id: skill.name, name: skill.name, category: skill.category,
      priority: skill.priority, description: skill.description, subSkills: skill.subSkills,
      radius: skill.priority === "high" ? 30 : skill.priority === "medium" ? 22 : 16,
      kind: "skill",
    };
    nodes.push(node);
    nodeSet.set(skill.name, node);
  }

  // Sub-skill satellites (expanded parents only)
  for (const skill of skillTree) {
    if (!expandedIds.has(skill.name)) continue;
    for (const sub of skill.subSkills) {
      if (nodeSet.has(sub)) continue;
      const subNode: GraphNode = {
        id: `${skill.name}::${sub}`, name: sub, category: skill.category,
        priority: "low", description: "", subSkills: [],
        radius: 5, kind: "sub", parentId: skill.name,
      };
      nodes.push(subNode);
      nodeSet.set(subNode.id, subNode);
      links.push({ source: skill.name, target: subNode.id, type: "sub" });
    }
  }

  // Related concept edges (deduplicated)
  for (const skill of skillTree) {
    for (const related of skill.relatedConcepts) {
      if (!nodeSet.has(related)) continue;
      const dup = links.some((l) => linkNodeId(l.source) === skill.name && linkNodeId(l.target) === related);
      if (!dup) links.push({ source: skill.name, target: related, type: "related", label: "related" });
    }
  }

  // Category chain edges
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
      const dup = links.some((l) => {
        const s = linkNodeId(l.source), t = linkNodeId(l.target);
        return (s === a && t === b) || (s === b && t === a);
      });
      if (!dup) links.push({ source: a, target: b, type: "category" });
    }
  }

  // Curve offsets for multi-edges
  const pairCount = new Map<string, number>();
  for (const link of links) {
    const key = [linkNodeId(link.source), linkNodeId(link.target)].sort().join("||");
    const count = (pairCount.get(key) ?? 0) + 1;
    pairCount.set(key, count);
    link.curveOffset = count > 1 ? (count % 2 === 0 ? count * 15 : -count * 15) : 25;
  }

  return { nodes, links };
}

// ── Component ────────────────────────────────────────────────────────────────

interface SkillGraphProps {
  skillTree: SkillNode[];
  skillProgress?: Record<string, SkillStatus | SkillProgressEntry>;
  onStatusChange?: (skillName: string, status: SkillStatus) => void;
  /** Optional per-node opacity override (e.g. for skill decay). */
  nodeOpacity?: (skillName: string) => number;
  theme?: "dark" | "light";
}

export function SkillGraph({ skillTree, skillProgress = {}, onStatusChange, nodeOpacity, theme }: SkillGraphProps) {
  const colors = GRAPH_THEMES[theme ?? "dark"];
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showEdgeLabels, setShowEdgeLabels] = useState(true);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });
  const posCache = useRef<Map<string, { x: number; y: number }>>(new Map());

  // Stable refs for callbacks used inside D3 (avoids re-running the entire effect)
  const skillProgressRef = useRef(skillProgress);
  skillProgressRef.current = skillProgress;
  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;
  const nodeOpacityRef = useRef(nodeOpacity);
  nodeOpacityRef.current = nodeOpacity;

  const categories = useMemo(() => [...new Set(skillTree.map((s) => s.category))], [skillTree]);

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
    const { nodes, links } = buildGraph(skillTree, expandedIds);
    const catPos = categoryPositions(categories, cx, cy, width, height);

    // Restore cached positions for smooth re-render
    const hasCache = posCache.current.size > 0;
    for (const n of nodes) {
      const cached = posCache.current.get(n.id);
      if (cached) { n.x = cached.x; n.y = cached.y; }
    }

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    // Background
    const defs = svg.append("defs");
    svg.append("rect").attr("width", width).attr("height", height).attr("fill", colors.background)
      .on("click", () => {
        handleBackgroundClick();
        mainGroup.selectAll(".node-rect").transition().duration(TRANSITION_MS).attr("stroke", colors.nodeStroke);
        linkPath.transition().duration(TRANSITION_MS)
          .attr("stroke", (d: GraphLink) => defaultLinkStroke(d, colors))
          .attr("stroke-opacity", (d: GraphLink) => defaultLinkOpacity(d));
        node.transition().duration(TRANSITION_MS).style("opacity", 1);
      });

    const mainGroup = svg.append("g");

    svg.call(
      d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.2, 5])
        .on("zoom", (event) => mainGroup.attr("transform", event.transform)),
    );

    // ── Category territory regions ──────────────────────────────────────────

    const regionGroup = mainGroup.append("g").attr("class", "regions");
    // Size each territory to roughly fill its grid cell
    const catCount = catPos.size;
    const regionRadius = catCount <= 2
      ? Math.min(width, height) * 0.3
      : Math.min(width, height) / (Math.sqrt(catCount) + 0.5) * 0.55;

    let catIdx = 0;
    for (const [cat, pos] of catPos) {
      const col = categoryColor(categories, cat, colors);

      // Soft glow filter per category
      const filterId = `region-blur-${catIdx}`;
      const regionFilter = defs.append("filter").attr("id", filterId)
        .attr("x", "-50%").attr("y", "-50%").attr("width", "200%").attr("height", "200%");
      regionFilter.append("feGaussianBlur").attr("in", "SourceGraphic").attr("stdDeviation", regionRadius * 0.35);

      // Territory glow — large blurred circle
      regionGroup.append("circle")
        .attr("cx", pos.x).attr("cy", pos.y).attr("r", regionRadius)
        .attr("fill", col).attr("opacity", colors.regionGlow * 2.5)
        .attr("filter", `url(#${filterId})`)
        .attr("stroke", "none");

      // Subtle dashed territory border
      regionGroup.append("circle")
        .attr("cx", pos.x).attr("cy", pos.y).attr("r", regionRadius * 0.75)
        .attr("fill", "none")
        .attr("stroke", col).attr("stroke-opacity", 0.12)
        .attr("stroke-width", 1).attr("stroke-dasharray", "6,4");

      // Category label
      regionGroup.append("text")
        .attr("x", pos.x).attr("y", pos.y - regionRadius * 0.75 - 8)
        .attr("fill", col).attr("font-size", 12).attr("opacity", 0.6)
        .attr("font-weight", 700).attr("text-anchor", "middle")
        .attr("letter-spacing", "0.08em")
        .style("font-family", "'Plus Jakarta Sans', system-ui, sans-serif")
        .style("text-transform", "uppercase")
        .text(cat);

      catIdx++;
    }

    // ── Force simulation ─────────────────────────────────────────────────────

    /** Resolve category center for a node (sub-skills follow parent). */
    const nodeCatPos = (d: GraphNode) => {
      const cat = d.parentId
        ? (nodes.find((n) => n.id === d.parentId)?.category ?? d.category)
        : d.category;
      return catPos.get(cat) ?? { x: cx, y: cy };
    };

    const pullStrength = (d: GraphNode): number =>
      d.kind === "sub" ? 0.25 : d.priority === "high" ? 0.55 : d.priority === "medium" ? 0.45 : 0.35;

    const simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink<GraphNode, GraphLink>(links).id((d) => d.id)
        .distance((d) => {
          if (d.type === "sub") return 50;
          const s = d.source as GraphNode, t = d.target as GraphNode;
          // Cross-category links are longer
          const sCat = s.category, tCat = t.category;
          return sCat === tCat ? 60 : 120;
        }))
      .force("charge", d3.forceManyBody<GraphNode>().strength((d) =>
        d.kind === "sub" ? -40 : d.priority === "high" ? -250 : d.priority === "medium" ? -150 : -80))
      .force("collide", d3.forceCollide<GraphNode>().radius((d) => d.radius + (d.kind === "sub" ? 10 : 20)))
      .force("x", d3.forceX<GraphNode>((d) => nodeCatPos(d).x).strength(pullStrength))
      .force("y", d3.forceY<GraphNode>((d) => nodeCatPos(d).y).strength(pullStrength));

    if (hasCache) { simulation.alpha(0.3).alphaDecay(0.03); }
    else { simulation.alphaDecay(0.02); }

    // ── Edges ────────────────────────────────────────────────────────────────

    const linkGroup = mainGroup.append("g").attr("class", "links");

    const linkPath = linkGroup.selectAll<SVGPathElement, GraphLink>("path")
      .data(links).join("path")
      .attr("fill", "none")
      .attr("stroke", (d) => defaultLinkStroke(d, colors))
      .attr("stroke-width", (d) => {
        if (d.type === "sub") return 1;
        const src = typeof d.source === "string" ? nodes.find((n) => n.id === d.source) : d.source as GraphNode;
        return src?.priority === "high" ? 2.2 : d.type === "related" ? 1.5 : 1;
      })
      .attr("stroke-dasharray", (d) => d.type === "sub" ? "4,3" : d.type === "category" ? "6,4" : "none")
      .attr("stroke-opacity", defaultLinkOpacity);

    // Edge labels (related links only)
    const edgeLabelGroup = linkGroup
      .selectAll<SVGGElement, GraphLink>("g.edge-label")
      .data(links.filter((l) => l.type === "related" && l.label))
      .join("g").attr("class", "edge-label")
      .style("display", showEdgeLabels ? "block" : "none");

    edgeLabelGroup.append("rect").attr("rx", 3).attr("ry", 3).attr("fill", colors.edgeLabelBg);
    edgeLabelGroup.append("text")
      .text((d) => d.label ?? "").attr("text-anchor", "middle").attr("dy", "0.35em")
      .attr("font-size", 8).attr("fill", colors.edgeLabelColor).attr("pointer-events", "none")
      .style("font-family", "system-ui, sans-serif");

    edgeLabelGroup.each(function () {
      const grp = d3.select(this);
      const textNode = grp.select("text").node() as SVGTextElement | null;
      if (!textNode) return;
      try {
        const bbox = textNode.getBBox();
        grp.select("rect").attr("x", bbox.x - 3).attr("y", bbox.y - 1)
          .attr("width", bbox.width + 6).attr("height", bbox.height + 2);
      } catch { /* getBBox can fail if not yet in DOM */ }
    });

    // ── Nodes ────────────────────────────────────────────────────────────────

    const node = mainGroup.append("g").attr("class", "nodes")
      .selectAll<SVGGElement, GraphNode>("g").data(nodes).join("g")
      .style("cursor", "pointer")
      .call(
        d3.drag<SVGGElement, GraphNode>()
          .on("start", (event, d) => {
            d.fx = d.x; d.fy = d.y;
            (d as any)._ds = { x: event.x, y: event.y };
            (d as any)._dragging = false;
          })
          .on("drag", (event, d) => {
            const ds = (d as any)._ds;
            if (!(d as any)._dragging && Math.hypot(event.x - ds.x, event.y - ds.y) > 3) {
              (d as any)._dragging = true;
              simulation.alphaTarget(0.3).restart();
            }
            if ((d as any)._dragging) { d.fx = event.x; d.fy = event.y; }
          })
          .on("end", (_, d) => {
            if ((d as any)._dragging) simulation.alphaTarget(0);
            d.fx = null; d.fy = null;
          }),
      );

    // Glow filter
    const glowFilter = defs.append("filter").attr("id", "node-glow")
      .attr("x", "-50%").attr("y", "-50%").attr("width", "200%").attr("height", "200%");
    glowFilter.append("feGaussianBlur").attr("in", "SourceGraphic").attr("stdDeviation", "6").attr("result", "blur");
    glowFilter.append("feComposite").attr("in", "SourceGraphic").attr("in2", "blur").attr("operator", "over");

    // Rounded-rect node
    const nodeSize = (d: GraphNode) => d.radius * 2;
    const nodeRx = (d: GraphNode) => d.priority === "high" ? 16 : d.priority === "medium" ? 12 : 8;

    node.append("rect").attr("class", "node-rect")
      .attr("width", (d) => nodeSize(d))
      .attr("height", (d) => nodeSize(d))
      .attr("x", (d) => -d.radius)
      .attr("y", (d) => -d.radius)
      .attr("rx", nodeRx).attr("ry", nodeRx)
      .attr("fill", (d) => {
        const status = resolveStatus(skillProgressRef.current[d.name]);
        if (status === "not_started" && d.kind === "skill") return colors.pendingFill;
        return categoryColor(categories, d.category, colors);
      })
      .attr("stroke", (d) => {
        const status = resolveStatus(skillProgressRef.current[d.name]);
        if (status === "not_started" && d.kind === "skill") return colors.pendingStroke;
        return colors.nodeStroke;
      })
      .attr("stroke-width", (d) => {
        const status = resolveStatus(skillProgressRef.current[d.name]);
        if (status === "not_started") return 1.5;
        return d.kind === "sub" ? 1.5 : 2;
      })
      .attr("stroke-dasharray", (d) => {
        const status = resolveStatus(skillProgressRef.current[d.name]);
        return status === "not_started" ? "4,3" : "none";
      })
      .attr("opacity", (d) => {
        const base = d.kind === "sub" ? 0.65 : d.priority === "low" ? 0.85 : 1;
        const decay = nodeOpacityRef.current ? nodeOpacityRef.current(d.name) : 1;
        return base * decay;
      })
      .attr("filter", (d) => {
        const status = resolveStatus(skillProgressRef.current[d.name]);
        return status !== "not_started" ? "url(#node-glow)" : "none";
      });

    // Conditional per-node elements
    node.each(function (d) {
      const el = d3.select(this);
      // Expand indicator (+/−)
      if (d.kind === "skill" && d.subSkills.length > 0) {
        el.append("text").attr("class", "expand-indicator")
          .text(expandedIds.has(d.id) ? "−" : "+")
          .attr("x", -d.radius + 2).attr("y", -d.radius + 2)
          .attr("font-size", 10).attr("font-weight", 700).attr("fill", "rgba(255,255,255,0.7)")
          .attr("text-anchor", "middle").attr("dominant-baseline", "central")
          .attr("pointer-events", "none")
          .style("font-family", "system-ui");
      }
      // Pulse animation class for learning nodes
      const status = resolveStatus(skillProgressRef.current[d.name]);
      if (status === "learning") {
        el.classed("learning-pulse", true);
      } else if (status === "mastered") {
        el.classed("mastered-breathe", true);
      }
    });

    // Status indicator dot (top-right corner)
    node.each(function (d) {
      const status = resolveStatus(skillProgressRef.current[d.name]);
      if (status === "not_started") return;
      const el = d3.select(this);
      el.append("circle")
        .attr("cx", d.radius - 4).attr("cy", -d.radius + 4)
        .attr("r", 4)
        .attr("fill", colors.statusColors[status])
        .attr("stroke", colors.nodeStroke)
        .attr("stroke-width", 1.5);
    });

    // Labels INSIDE the node
    node.append("text")
      .text((d) => {
        const maxLen = d.priority === "high" ? 10 : d.priority === "medium" ? 7 : 5;
        return d.name.length > maxLen ? d.name.substring(0, maxLen) + "…" : d.name;
      })
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "central")
      .attr("fill", (d) => {
        const status = resolveStatus(skillProgressRef.current[d.name]);
        if (status === "not_started") return colors.labelMuted;
        return "#fff";
      })
      .attr("font-size", (d) => d.kind === "sub" ? 8 : d.priority === "high" ? 11 : d.priority === "medium" ? 9 : 8)
      .attr("font-weight", 700)
      .attr("pointer-events", "none")
      .style("font-family", "'Plus Jakarta Sans', system-ui, sans-serif");

    // ── Interactions ─────────────────────────────────────────────────────────

    node
      .on("mouseenter", function (_, d) {
        d3.select(this).select<SVGRectElement>(".node-rect")
          .transition().duration(TRANSITION_MS).attr("stroke", colors.labelColor).attr("stroke-width", 3);
        const connected = getConnectedIds(d.id, links);
        node.transition().duration(TRANSITION_MS).style("opacity", (n) => connected.has(n.id) ? 1 : 0.15);
        linkPath.transition().duration(TRANSITION_MS)
          .attr("stroke-opacity", (l) => isLinkedTo(l, d.id) ? 1 : 0.08);
      })
      .on("mouseleave", function () {
        node.each(function (nd) {
          d3.select(this).select<SVGRectElement>(".node-rect")
            .transition().duration(TRANSITION_MS).attr("stroke", colors.nodeStroke).attr("stroke-width", nodeStrokeWidth(nd));
        });
        node.transition().duration(TRANSITION_MS).style("opacity", 1);
        linkPath.transition().duration(TRANSITION_MS).attr("stroke-opacity", defaultLinkOpacity);
      })
      .on("click", (event, d) => {
        event.stopPropagation();
        if (d.kind === "skill" && d.subSkills.length > 0) toggleExpand(d.id);

        const connected = getConnectedIds(d.id, links);
        node.each(function (nd) {
          d3.select(this).select<SVGRectElement>(".node-rect")
            .transition().duration(TRANSITION_MS)
            .attr("stroke", nd.id === d.id ? colors.highlight : colors.nodeStroke)
            .attr("stroke-width", nd.id === d.id ? 4 : nodeStrokeWidth(nd));
        });
        linkPath.transition().duration(TRANSITION_MS)
          .attr("stroke", (l) => isLinkedTo(l, d.id) ? colors.highlight : defaultLinkStroke(l, colors))
          .attr("stroke-width", (l) => isLinkedTo(l, d.id) ? 2.5 : 1.2);
        node.transition().duration(TRANSITION_MS).style("opacity", (n) => connected.has(n.id) ? 1 : 0.15);
        setSelectedNode(d);
      })
      .on("dblclick", (event, d) => {
        event.stopPropagation();
        const cb = onStatusChangeRef.current;
        if (!cb || d.kind === "sub") return;
        const next = NEXT_STATUS[resolveStatus(skillProgressRef.current[d.name])];
        cb(d.name, next);
        d3.select(event.currentTarget).select(".status-ring")
          .transition().duration(TRANSITION_MS)
          .attr("stroke", colors.statusColors[next])
          .attr("stroke-opacity", next === "not_started" ? 0 : 0.8);
      });

    // ── Tick ─────────────────────────────────────────────────────────────────

    simulation.on("tick", () => {
      linkPath.attr("d", (d) => {
        const s = d.source as GraphNode, t = d.target as GraphNode;
        if (d.type === "sub") return `M${s.x},${s.y} L${t.x},${t.y}`;
        return curvedPath(s.x ?? 0, s.y ?? 0, t.x ?? 0, t.y ?? 0, d.curveOffset ?? 25);
      });

      edgeLabelGroup.attr("transform", (d) => {
        const s = d.source as GraphNode, t = d.target as GraphNode;
        const mid = curvedMidpoint(s.x ?? 0, s.y ?? 0, t.x ?? 0, t.y ?? 0, d.curveOffset ?? 25);
        return `translate(${mid.x},${mid.y})`;
      });

      node.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });

    return () => {
      for (const n of nodes) {
        if (n.x != null && n.y != null) posCache.current.set(n.id, { x: n.x, y: n.y });
      }
      simulation.stop();
    };
  }, [skillTree, dimensions, expandedIds, categories, handleBackgroundClick, showEdgeLabels, toggleExpand, colors]);
  // Note: skillProgress and onStatusChange accessed via refs to avoid full SVG rebuild

  // Toggle edge label visibility without re-rendering the graph
  const toggleLabelsRef = useRef(showEdgeLabels);
  useEffect(() => {
    // Skip on first render (labels are already set correctly in main effect)
    if (toggleLabelsRef.current === showEdgeLabels) return;
    toggleLabelsRef.current = showEdgeLabels;
    if (!svgRef.current) return;
    d3.select(svgRef.current).selectAll(".edge-label")
      .transition().duration(200).style("display", showEdgeLabels ? "block" : "none");
  }, [showEdgeLabels]);

  // ── JSX ────────────────────────────────────────────────────────────────────

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%", height: "100%", minHeight: 400 }}>
      <svg ref={svgRef} width={dimensions.width} height={dimensions.height} style={{ display: "block" }} />

      {/* Edge labels toggle */}
      <div style={{
        position: "absolute", top: 56, right: 20, display: "flex", alignItems: "center", gap: 10,
        background: colors.legendBg, padding: "8px 14px", borderRadius: 20,
        border: `1px solid ${colors.legendBorder}`, boxShadow: "0 2px 8px rgba(0,0,0,0.04)", zIndex: 10,
      }}>
        <label style={{ position: "relative", display: "inline-block", width: 40, height: 22, cursor: "pointer" }}>
          <input type="checkbox" checked={showEdgeLabels} onChange={(e) => setShowEdgeLabels(e.target.checked)}
            style={{ opacity: 0, width: 0, height: 0, position: "absolute" }} />
          <span style={{ position: "absolute", cursor: "pointer", inset: 0, backgroundColor: showEdgeLabels ? colors.highlight : colors.legendBorder, borderRadius: 22, transition: "0.3s" }}>
            <span style={{ position: "absolute", height: 16, width: 16, left: showEdgeLabels ? 21 : 3, bottom: 3, backgroundColor: "white", borderRadius: "50%", transition: "0.3s" }} />
          </span>
        </label>
        <span style={{ fontSize: 12, color: colors.legendText }}>Labels</span>
      </div>

      {/* Category legend */}
      <div style={{
        position: "absolute", bottom: 24, left: 24, background: colors.legendBg,
        padding: "12px 16px", borderRadius: 8, border: `1px solid ${colors.legendBorder}`,
        boxShadow: "0 4px 16px rgba(0,0,0,0.06)", zIndex: 10,
      }}>
        <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: colors.highlight, marginBottom: 10, textTransform: "uppercase" as const, letterSpacing: 0.5 }}>
          Categories
        </span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 14px", maxWidth: 340 }}>
          {categories.map((cat) => (
            <div key={cat} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: colors.legendText }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: categoryColor(categories, cat, colors), flexShrink: 0 }} />
              <span style={{ whiteSpace: "nowrap" }}>{cat}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Status + hints legend */}
      <div style={{
        position: "absolute", bottom: 24, right: 20, background: colors.legendBg,
        padding: "10px 14px", borderRadius: 8, border: `1px solid ${colors.legendBorder}`,
        boxShadow: "0 4px 16px rgba(0,0,0,0.06)", fontSize: 11, display: "flex", flexDirection: "column", gap: 8, zIndex: 10,
      }}>
        <div style={{ display: "flex", gap: 12 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", border: `2px solid ${colors.statusColors.learning}` }} />
            <span style={{ color: colors.legendText }}>Learning</span>
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", border: `2px solid ${colors.statusColors.mastered}` }} />
            <span style={{ color: colors.legendText }}>Mastered</span>
          </span>
        </div>
        <div style={{ color: colors.legendText, fontSize: 10, lineHeight: 1.4 }}>
          Click to expand sub-skills &middot; Dbl-click to toggle status
        </div>
      </div>

      {/* Detail panel */}
      {selectedNode && selectedNode.kind === "skill" && (
        <DetailPanel
          node={selectedNode}
          categories={categories}
          skillProgress={skillProgress}
          onStatusChange={onStatusChange}
          onClose={() => setSelectedNode(null)}
          colors={colors}
        />
      )}
    </div>
  );
}

// ── Detail Panel (extracted) ─────────────────────────────────────────────────

function DetailPanel({ node, categories, skillProgress, onStatusChange, onClose, colors }: {
  node: GraphNode;
  categories: string[];
  skillProgress: Record<string, SkillStatus | SkillProgressEntry>;
  onStatusChange?: (name: string, status: SkillStatus) => void;
  onClose: () => void;
  colors: GraphTheme;
}) {
  const priorityStyle = {
    high: { bg: "#FDECEA", color: "#C62828" },
    medium: { bg: "#FFF8E1", color: "#F57F17" },
    low: { bg: "#E8F5E9", color: "#2E7D32" },
  }[node.priority];

  return (
    <div style={{
      position: "absolute", top: 60, right: 12, width: "min(310px, calc(100% - 24px))", maxHeight: "calc(100% - 100px)",
      background: colors.legendBg, border: `1px solid ${colors.legendBorder}`, borderRadius: 10,
      boxShadow: "0 8px 32px rgba(0,0,0,0.1)", overflow: "hidden",
      fontFamily: "system-ui, sans-serif", fontSize: 13, zIndex: 20, display: "flex", flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", background: colors.background, borderBottom: `1px solid ${colors.legendBorder}`, flexShrink: 0 }}>
        <span style={{ fontWeight: 600, color: colors.labelColor, fontSize: 14 }}>Node Details</span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ padding: "3px 10px", borderRadius: 12, fontSize: 10, fontWeight: 500, background: categoryColor(categories, node.category, colors), color: "#fff" }}>
            {node.category}
          </span>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: colors.labelMuted, lineHeight: 1, padding: 0 }}>×</button>
        </div>
      </div>
      {/* Content */}
      <div style={{ padding: 14, overflowY: "auto", flex: 1 }}>
        <div style={{ marginBottom: 10 }}>
          <span style={{ color: colors.labelMuted, fontSize: 11, fontWeight: 500 }}>Name: </span>
          <span style={{ color: colors.labelColor, fontWeight: 600 }}>{node.name}</span>
        </div>
        <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ color: colors.labelMuted, fontSize: 11, fontWeight: 500 }}>Priority: </span>
          <span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 500, background: priorityStyle.bg, color: priorityStyle.color }}>
            {node.priority}
          </span>
        </div>
        {node.description && (
          <div style={{ marginBottom: 12 }}>
            <span style={{ display: "block", color: colors.labelMuted, fontSize: 11, fontWeight: 500, marginBottom: 4 }}>Summary:</span>
            <p style={{ margin: 0, lineHeight: 1.6, color: colors.labelColor, fontSize: 12 }}>{node.description}</p>
          </div>
        )}
        {node.subSkills.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <span style={{ display: "block", color: colors.labelMuted, fontSize: 11, fontWeight: 500, marginBottom: 6 }}>
              Sub-skills ({node.subSkills.length}):
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {node.subSkills.map((s) => (
                <span key={s} style={{ padding: "3px 8px", borderRadius: 5, background: colors.pendingFill, fontSize: 10, color: colors.legendText, border: `1px solid ${colors.pendingStroke}` }}>{s}</span>
              ))}
            </div>
          </div>
        )}
        {onStatusChange && (
          <div>
            <span style={{ display: "block", color: colors.labelMuted, fontSize: 11, fontWeight: 500, marginBottom: 6 }}>Status:</span>
            <div style={{ display: "flex", gap: 5 }}>
              {(["not_started", "learning", "mastered"] as SkillStatus[]).map((s) => {
                const current = resolveStatus(skillProgress[node.name]);
                const active = current === s;
                const label = { not_started: "Not Started", learning: "Learning", mastered: "Mastered" }[s];
                const clr = { not_started: colors.labelMuted, learning: "#F57F17", mastered: "#2E7D32" }[s];
                return (
                  <button key={s} onClick={() => onStatusChange(node.name, s)} style={{
                    padding: "4px 12px", borderRadius: 5, fontSize: 10, fontWeight: active ? 600 : 400,
                    border: `1.5px solid ${active ? clr : colors.legendBorder}`,
                    background: active ? `${clr}15` : "transparent",
                    color: active ? clr : colors.labelMuted, cursor: "pointer", transition: "all 0.15s",
                  }}>{label}</button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
