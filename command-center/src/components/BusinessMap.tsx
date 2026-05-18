// BusinessMap — segregated business-area renderer.
//
// Layout strategy:
//   1. business-area nodes become xyflow GROUP containers (visible boxes)
//   2. process / integration / data-source / pain-point nodes become CHILDREN
//      of their parent area (via `parentId` + `extent: "parent"`) — assigned
//      by following `contains` edges from area → child.
//   3. children are dagre-laid-out INSIDE each parent box (TB rank).
//   4. parent boxes are themselves laid out in a row/grid by dagre.
//   5. cross-area edges (reads / triggers / flows-to / blocks) route between
//      the leaf nodes, crossing area boundaries visually.
//
// Used by Cleo customer detail · Canvas tab AND Cleo niche library detail.

import { useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  MarkerType,
  Position,
  Handle,
  type Node,
  type NodeProps,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";

export interface MapNodeShape {
  id: string;
  kind: string;
  label: string;
  subLabel?: string;
  data?: Record<string, any>;
}
export interface MapEdgeShape {
  id: string;
  source: string;
  target: string;
  kind?: string;
  label?: string;
}

// ─── Inner leaf node (process / integration / data-source / pain) ──────
function LeafNode({ data }: NodeProps): JSX.Element {
  const d = data as {
    label: string;
    sub?: string;
    subLabel?: string;
    automation?: "ai" | "user-action";
    areaHue?: number;
  };
  const cls =
    d.automation === "ai" ? "is-ai"
    : d.automation === "user-action" ? "is-user"
    : "";
  const accentStyle = d.areaHue !== undefined
    ? ({ ['--area-hue' as any]: String(d.areaHue) } as React.CSSProperties)
    : undefined;
  return (
    <div className={`canvas-node ${cls}`} style={accentStyle}>
      <Handle type="target" position={Position.Top} className="canvas-node-handle" />
      <div className="canvas-node-head">
        {d.sub ? <span className="canvas-node-kind">{d.sub}</span> : null}
        {d.automation === "ai" ? <span className="canvas-node-badge ai">AI</span> : null}
        {d.automation === "user-action" ? <span className="canvas-node-badge user">USER</span> : null}
      </div>
      <div className="canvas-node-label">{d.label}</div>
      {d.subLabel ? <div className="canvas-node-sub">{d.subLabel}</div> : null}
      <Handle type="source" position={Position.Bottom} className="canvas-node-handle" />
    </div>
  );
}

// ─── Area container node (acts as a box around its children) ──────────
function AreaNode({ data }: NodeProps): JSX.Element {
  const d = data as {
    label: string;
    subLabel?: string;
    childCount: number;
    hue: number;
  };
  return (
    <div className="canvas-area" style={{ ['--area-hue' as any]: String(d.hue) }}>
      <div className="canvas-area-head">
        <span className="canvas-area-tag">AREA</span>
        <strong className="canvas-area-title">{d.label}</strong>
        <span className="canvas-area-count">{d.childCount}</span>
      </div>
      {d.subLabel ? <div className="canvas-area-sub">{d.subLabel}</div> : null}
    </div>
  );
}

const NODE_TYPES = { leaf: LeafNode, area: AreaNode };

export function BusinessMap({
  nodes,
  edges,
  onNodeClick,
  showMinimap = true,
}: {
  nodes: MapNodeShape[];
  edges: MapEdgeShape[];
  onNodeClick?: (id: string) => void;
  showMinimap?: boolean;
}): JSX.Element {
  const laid = useMemo(() => layout(nodes, edges), [nodes, edges]);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // ESC to exit fullscreen.
  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setIsFullscreen(false); };
    window.addEventListener("keydown", onKey);
    // Prevent body scroll while overlay is up.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [isFullscreen]);

  if (!nodes || nodes.length === 0) {
    return <div className="empty"><strong>Empty map</strong><p>No nodes to draw.</p></div>;
  }

  const wrapperClass = isFullscreen ? "business-map-wrapper fullscreen" : "business-map-wrapper";

  const flow = (
    <ReactFlowProvider>
      <ReactFlow
        nodes={laid.nodes}
        edges={laid.edges}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.05}
        maxZoom={4}
        zoomOnScroll
        zoomOnPinch
        zoomOnDoubleClick
        panOnScroll={false}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={!!onNodeClick}
        onNodeClick={(_, n) => { if (n.type !== "area") onNodeClick?.(n.id); }}
      >
        <Background gap={24} size={1} color="rgba(255,255,255,0.04)" />
        <Controls showInteractive={false} />
        {showMinimap ? (
          <MiniMap
            pannable
            zoomable
            nodeColor={(n) => {
              if (n.type === "area") {
                const hue = (n.data as any)?.hue ?? 0;
                return `hsla(${hue}, 60%, 60%, 0.35)`;
              }
              const a = (n.data as any)?.automation;
              if (a === "ai") return "rgba(74, 222, 128, 0.7)";
              if (a === "user-action") return "rgba(251, 191, 36, 0.7)";
              return "rgba(255, 255, 255, 0.4)";
            }}
            nodeStrokeColor={() => "rgba(255, 255, 255, 0.6)"}
            nodeStrokeWidth={1.5}
            nodeBorderRadius={4}
            maskColor="rgba(0, 0, 0, 0.6)"
          />
        ) : null}
      </ReactFlow>
      <button
        type="button"
        className="business-map-fs-btn"
        onClick={() => setIsFullscreen((v) => !v)}
        aria-label={isFullscreen ? "Exit fullscreen (Esc)" : "Open fullscreen"}
        title={isFullscreen ? "Exit fullscreen (Esc)" : "Open fullscreen"}
      >
        {isFullscreen ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 3v4a1 1 0 0 1-1 1H3M21 8h-4a1 1 0 0 1-1-1V3M3 16h4a1 1 0 0 1 1 1v4M16 21v-4a1 1 0 0 1 1-1h4"/>
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6"/>
          </svg>
        )}
        <span>{isFullscreen ? "Exit fullscreen" : "Fullscreen"}</span>
      </button>
    </ReactFlowProvider>
  );

  return <div className={wrapperClass}>{flow}</div>;
}

// ─── Layout: dagre per-area, then dagre the areas ──────────────────────

const LEAF_W = 240;
const LEAF_H = 100;
const AREA_PAD_X = 24;
const AREA_PAD_TOP = 70; // room for area header
const AREA_PAD_BOTTOM = 24;

function layout(rawN: MapNodeShape[], rawE: MapEdgeShape[]): { nodes: Node[]; edges: Edge[] } {
  if (!rawN.length) return { nodes: [], edges: [] };

  // Split nodes by kind
  const areas = rawN.filter((n) => n.kind === "business-area");
  const leaves = rawN.filter((n) => n.kind !== "business-area");

  // Map child → parent area via `contains` edges from area to child
  const parentOf: Record<string, string> = {};
  for (const e of rawE) {
    if (e.kind !== "contains") continue;
    const isAreaSource = areas.some((a) => a.id === e.source);
    if (isAreaSource && !parentOf[e.target]) parentOf[e.target] = e.source;
  }

  // Orphan leaves (no parent area) get bucketed into a synthetic "Other" area
  // so they still appear segregated rather than floating.
  const orphans = leaves.filter((n) => !parentOf[n.id]);
  let syntheticOther: MapNodeShape | null = null;
  if (orphans.length > 0) {
    syntheticOther = {
      id: "__area_other",
      kind: "business-area",
      label: "Other",
      subLabel: "uncategorized",
    };
    for (const o of orphans) parentOf[o.id] = syntheticOther.id;
  }
  const allAreas = syntheticOther ? [...areas, syntheticOther] : areas;

  // Assign each area a deterministic hue (around the color wheel)
  const hueByArea: Record<string, number> = {};
  allAreas.forEach((a, i) => {
    hueByArea[a.id] = Math.round((i * 360) / Math.max(allAreas.length, 1));
  });

  // ── Step 1: lay out children INSIDE each area with its own dagre ────
  const childPositions: Record<string, { x: number; y: number }> = {};
  const areaSizes: Record<string, { width: number; height: number }> = {};

  for (const area of allAreas) {
    const childIds = leaves.filter((n) => parentOf[n.id] === area.id).map((n) => n.id);
    if (childIds.length === 0) {
      areaSizes[area.id] = { width: LEAF_W + AREA_PAD_X * 2, height: AREA_PAD_TOP + AREA_PAD_BOTTOM + 20 };
      continue;
    }
    const g = new dagre.graphlib.Graph();
    g.setGraph({
      rankdir: "TB",
      nodesep: 24,
      ranksep: 36,
      marginx: 12,
      marginy: 12,
      ranker: "tight-tree",
    });
    g.setDefaultEdgeLabel(() => ({}));
    for (const cid of childIds) g.setNode(cid, { width: LEAF_W, height: LEAF_H });
    for (const e of rawE) {
      // Only route edges that stay inside this area
      if (childIds.includes(e.source) && childIds.includes(e.target)) {
        g.setEdge(e.source, e.target);
      }
    }
    dagre.layout(g);
    // Find bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const cid of childIds) {
      const p = g.node(cid);
      if (!p) continue;
      minX = Math.min(minX, p.x - LEAF_W / 2);
      minY = Math.min(minY, p.y - LEAF_H / 2);
      maxX = Math.max(maxX, p.x + LEAF_W / 2);
      maxY = Math.max(maxY, p.y + LEAF_H / 2);
    }
    // Shift so top-left is (AREA_PAD_X, AREA_PAD_TOP)
    const shiftX = AREA_PAD_X - minX;
    const shiftY = AREA_PAD_TOP - minY;
    for (const cid of childIds) {
      const p = g.node(cid);
      if (p) {
        childPositions[cid] = {
          x: p.x - LEAF_W / 2 + shiftX,
          y: p.y - LEAF_H / 2 + shiftY,
        };
      }
    }
    const innerW = maxX - minX;
    const innerH = maxY - minY;
    areaSizes[area.id] = {
      width: Math.max(LEAF_W + AREA_PAD_X * 2, innerW + AREA_PAD_X * 2),
      height: AREA_PAD_TOP + innerH + AREA_PAD_BOTTOM,
    };
  }

  // ── Step 2: lay out the areas themselves with dagre ────────────────
  const ag = new dagre.graphlib.Graph();
  ag.setGraph({
    rankdir: "TB",
    nodesep: 60,
    ranksep: 90,
    marginx: 40,
    marginy: 40,
    ranker: "tight-tree",
  });
  ag.setDefaultEdgeLabel(() => ({}));
  for (const area of allAreas) {
    const s = areaSizes[area.id];
    ag.setNode(area.id, { width: s.width, height: s.height });
  }
  // Use cross-area edges (between leaves in different areas) to inform area layout
  for (const e of rawE) {
    const ps = parentOf[e.source];
    const pt = parentOf[e.target];
    if (ps && pt && ps !== pt) {
      try { ag.setEdge(ps, pt, { weight: 1 }); } catch { /* */ }
    }
  }
  dagre.layout(ag);

  // ── Step 3: build xyflow nodes ─────────────────────────────────────
  const xNodes: Node[] = [];

  for (const area of allAreas) {
    const size = areaSizes[area.id];
    const pos = ag.node(area.id);
    if (!pos) continue;
    const childCount = leaves.filter((n) => parentOf[n.id] === area.id).length;
    xNodes.push({
      id: area.id,
      type: "area",
      position: { x: pos.x - size.width / 2, y: pos.y - size.height / 2 },
      data: {
        label: area.label,
        subLabel: area.subLabel,
        childCount,
        hue: hueByArea[area.id] ?? 0,
      },
      style: { width: size.width, height: size.height, zIndex: 0 } as any,
      selectable: false,
      draggable: false,
    });
  }

  for (const n of leaves) {
    const parent = parentOf[n.id];
    const childPos = childPositions[n.id] ?? { x: AREA_PAD_X, y: AREA_PAD_TOP };
    xNodes.push({
      id: n.id,
      type: "leaf",
      position: childPos,
      parentId: parent,
      extent: parent ? "parent" : undefined,
      data: {
        label: n.label,
        sub: kindLabel(n.kind),
        subLabel: n.subLabel,
        areaHue: parent ? hueByArea[parent] : undefined,
        ...(n.data ?? {}),
      },
    } as Node);
  }

  // ── Step 4: build edges (only between leaves; suppress area-area contains) ─
  const xEdges: Edge[] = rawE
    .filter((e) => !(parentOf[e.target] && e.kind === "contains" && areas.some((a) => a.id === e.source)))
    .map((e) => {
      const s = edgeStyle(e.kind);
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label ?? e.kind ?? "",
        type: "smoothstep",
        animated: s.animated,
        markerEnd: { type: MarkerType.ArrowClosed, color: s.color },
        style: { stroke: s.color, strokeWidth: s.width, strokeDasharray: s.dash },
        labelStyle: { fill: s.color, fontSize: 9, fontFamily: "var(--font-mono)", letterSpacing: "0.04em" },
        labelBgStyle: { fill: "rgba(0,0,0,0.6)" },
        labelBgPadding: [4, 2] as [number, number],
        labelBgBorderRadius: 2,
        zIndex: 1,
      };
    });

  return { nodes: xNodes, edges: xEdges };
}

function kindLabel(kind: string | undefined): string {
  switch (kind) {
    case "process": return "PROCESS";
    case "data-source": return "DATA";
    case "integration": return "INTEGRATION";
    case "pain-point": return "PAIN";
    default: return "NODE";
  }
}

function edgeStyle(kind: string | undefined): { color: string; width: number; dash?: string; animated: boolean } {
  switch (kind) {
    case "contains": return { color: "rgba(255,255,255,0.18)", width: 1, dash: "2 4", animated: false };
    case "reads": return { color: "rgba(96,165,250,0.75)", width: 1.4, dash: "5 3", animated: false };
    case "triggers": return { color: "rgba(251,191,36,0.85)", width: 1.6, animated: true };
    case "flows-to":
    case "feeds":
    case "leads-to": return { color: "rgba(255,255,255,0.85)", width: 1.6, animated: true };
    case "blocks": return { color: "rgba(248,113,113,0.85)", width: 1.4, animated: false };
    default: return { color: "rgba(255,255,255,0.55)", width: 1.2, animated: false };
  }
}
