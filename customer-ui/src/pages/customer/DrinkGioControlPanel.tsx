import { useMemo, useState } from "react";

type ToolState = "live" | "paused" | "needs-setup";

type ClientTool = {
  id: string;
  name: string;
  purpose: string;
  owner: string;
  dataUsed: string;
  state: ToolState;
};

type CanvasNode = {
  id: string;
  label: string;
  kind: "goal" | "process" | "tool" | "data" | "control";
  x: number;
  y: number;
};

const canvasNodes: CanvasNode[] = [
  { id: "goal", label: "Grow matcha subscriptions", kind: "goal", x: 8, y: 12 },
  { id: "storefront", label: "Website + offers", kind: "process", x: 34, y: 9 },
  { id: "tools", label: "Operator tools", kind: "tool", x: 60, y: 12 },
  { id: "data", label: "Company data", kind: "data", x: 34, y: 58 },
  { id: "cleo", label: "Cleo control layer", kind: "control", x: 60, y: 58 },
  { id: "ops", label: "Manual decisions", kind: "control", x: 82, y: 36 },
];

const stackItems = [
  { label: "Website", value: "Pages, offers, launches", status: "ready" },
  { label: "Sales", value: "Orders, subscribers, campaigns", status: "needs data" },
  { label: "Tools", value: "Business controls", status: "ready" },
  { label: "Cleo", value: "Business assistant", status: "ready" },
];

const clientTools: ClientTool[] = [
  {
    id: "site-builder",
    name: "Site Builder",
    purpose: "Build and edit branded website pages, product sections, offers, and launches.",
    owner: "Growth",
    dataUsed: "Pages, sections, images, offers, campaign notes",
    state: "live",
  },
  {
    id: "product-workbench",
    name: "Product Workbench",
    purpose: "Manage product copy, bundles, claims, pricing notes, and compliance review.",
    owner: "Commerce",
    dataUsed: "Products, bundles, copy drafts, review notes",
    state: "live",
  },
  {
    id: "customer-data",
    name: "Customer Data",
    purpose: "View customer segments, subscriptions, churn risk, order health, and retention signals.",
    owner: "Operations",
    dataUsed: "Customers, orders, subscriptions, segments",
    state: "needs-setup",
  },
  {
    id: "campaign-control",
    name: "Campaign Control",
    purpose: "Control email, SMS, audience exports, campaign briefs, and growth experiments.",
    owner: "Growth",
    dataUsed: "Campaigns, audiences, messages, results",
    state: "live",
  },
  {
    id: "money-room",
    name: "Money Room",
    purpose: "Track revenue, ad spend, margin signals, ROAS, payouts, and unit economics.",
    owner: "Finance",
    dataUsed: "Revenue, spend, margins, payouts, daily metrics",
    state: "live",
  },
  {
    id: "connections",
    name: "Connections",
    purpose: "Connect Shopify, Stripe, Klaviyo, Meta, Google, warehouse, and support tools.",
    owner: "Admin",
    dataUsed: "Connected accounts, sync status, failed imports",
    state: "paused",
  },
];

const actions = [
  "Edit website",
  "Create offer",
  "Sync products",
  "Review customers",
  "Generate copy",
  "Open errors",
  "Pause automation",
  "Ask Cleo",
];

const dataViews = [
  { name: "Customers", source: "Customer records and segments", status: "ready for live data" },
  { name: "Orders", source: "Orders and subscriptions", status: "waiting on commerce connection" },
  { name: "Products", source: "Product library and copy drafts", status: "ready" },
  { name: "Campaigns", source: "Campaigns and audiences", status: "ready" },
  { name: "Errors", source: "Failed imports and stuck jobs", status: "needs live runtime" },
];

function statusLabel(state: ToolState) {
  if (state === "live") return "Live";
  if (state === "paused") return "Paused";
  return "Needs setup";
}

export default function DrinkGioControlPanel(): JSX.Element {
  const [tools, setTools] = useState(clientTools);
  const [activeTool, setActiveTool] = useState(clientTools[0]);
  const [log, setLog] = useState<string[]>([
    "Gio workspace loaded.",
    "Business map, tools, data views, and manual controls are ready.",
  ]);

  const summary = useMemo(() => {
    return {
      live: tools.filter((tool) => tool.state === "live").length,
      paused: tools.filter((tool) => tool.state === "paused").length,
      setup: tools.filter((tool) => tool.state === "needs-setup").length,
    };
  }, [tools]);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setLog((current) => [`${timestamp} · ${message}`, ...current].slice(0, 8));
  };

  const setToolState = (id: string, state: ToolState) => {
    const target = tools.find((tool) => tool.id === id);
    if (!target) return;
    const nextTool = { ...target, state };
    setTools((current) => current.map((tool) => tool.id === id ? nextTool : tool));
    setActiveTool(nextTool);
    addLog(`${target.name} set to ${statusLabel(state).toLowerCase()}.`);
  };

  return (
    <main className="gio-os">
      <aside className="gio-os-rail" aria-label="Gio workspace navigation">
        <div className="gio-os-mark">GIÓ</div>
        <nav>
          {["Map", "Tools", "Data", "Cleo", "Controls", "Settings"].map((item) => (
            <button key={item} type="button" onClick={() => addLog(`Opened ${item}.`)}>
              {item}
            </button>
          ))}
        </nav>
      </aside>

      <section className="gio-os-main">
        <header className="gio-os-topbar">
          <div>
            <p>Gio Company Workspace</p>
            <h1>Gio Operating System</h1>
          </div>
          <div className="gio-os-actions">
            <button type="button" onClick={() => addLog("Workspace refresh requested.")}>
              Refresh workspace
            </button>
            <button type="button" onClick={() => addLog("Cleo opened with Gio operating context.")}>
              Open Cleo
            </button>
          </div>
        </header>

        <section className="gio-os-grid gio-os-stack" aria-label="Client stack">
          {stackItems.map((item) => (
            <article key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.status}</small>
            </article>
          ))}
        </section>

        <section className="gio-os-canvas-panel">
          <div className="gio-os-panel-head">
            <div>
              <p>Business-map canvas</p>
              <h2>How Gio runs the business</h2>
            </div>
            <span>from Gio business map</span>
          </div>
          <div className="gio-os-canvas" aria-label="Gio business map canvas">
            <svg className="gio-os-canvas-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <line x1="19" y1="19" x2="43" y2="16" />
              <line x1="47" y1="20" x2="67" y2="20" />
              <line x1="45" y1="24" x2="45" y2="58" />
              <line x1="67" y1="25" x2="67" y2="58" />
              <line x1="72" y1="62" x2="85" y2="43" />
              <line x1="46" y1="63" x2="62" y2="63" />
            </svg>
            {canvasNodes.map((node) => (
              <button
                key={node.id}
                type="button"
                className="gio-os-canvas-node"
                data-kind={node.kind}
                style={{ left: `${node.x}%`, top: `${node.y}%` }}
                onClick={() => addLog(`Canvas node opened: ${node.label}.`)}
              >
                <span>{node.kind}</span>
                <strong>{node.label}</strong>
              </button>
            ))}
          </div>
        </section>

        <section className="gio-os-board">
          <div className="gio-os-panel">
            <div className="gio-os-panel-head">
              <div>
                <p>Tools</p>
                <h2>{summary.live} live · {summary.paused} paused · {summary.setup} setup</h2>
              </div>
            </div>
            <div className="gio-os-tool-list">
              {tools.map((tool) => (
                <button
                  key={tool.id}
                  type="button"
                  data-state={tool.state}
                  aria-pressed={activeTool.id === tool.id}
                  onClick={() => setActiveTool(tool)}
                >
                  <strong>{tool.name}</strong>
                  <span>{tool.purpose}</span>
                  <small>{statusLabel(tool.state)}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="gio-os-panel">
            <div className="gio-os-panel-head">
              <div>
                <p>Selected tool</p>
                <h2>{activeTool.name}</h2>
              </div>
              <span>{statusLabel(activeTool.state)}</span>
            </div>
            <p className="gio-os-copy">{activeTool.purpose}</p>
            <dl className="gio-os-contract">
              <div>
                <dt>Owner</dt>
                <dd>{activeTool.owner}</dd>
              </div>
              <div>
                <dt>Information used</dt>
                <dd>{activeTool.dataUsed}</dd>
              </div>
              <div>
                <dt>Automation</dt>
                <dd>Can run in the background and still be controlled manually here.</dd>
              </div>
            </dl>
            <div className="gio-os-button-row">
              <button type="button" onClick={() => setToolState(activeTool.id, "live")}>Enable</button>
              <button type="button" onClick={() => setToolState(activeTool.id, "paused")}>Pause</button>
              <button type="button" onClick={() => addLog(`Fix ticket opened for ${activeTool.name}.`)}>
                Open fix ticket
              </button>
            </div>
          </div>
        </section>

        <section className="gio-os-bottom">
          <article className="gio-os-panel">
            <div className="gio-os-panel-head">
              <div>
                <p>Data room</p>
                <h2>Client data views</h2>
              </div>
            </div>
            <table className="gio-os-table">
              <thead>
                <tr>
                  <th>View</th>
                  <th>Source</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {dataViews.map((view) => (
                  <tr key={view.name}>
                    <td>{view.name}</td>
                    <td>{view.source}</td>
                    <td>{view.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>

          <article className="gio-os-panel">
            <div className="gio-os-panel-head">
              <div>
                <p>Manual controls</p>
                <h2>Operator actions</h2>
              </div>
            </div>
            <div className="gio-os-tools">
              {actions.map((action) => (
                <button key={action} type="button" onClick={() => addLog(`${action} requested.`)}>
                  {action}
                </button>
              ))}
            </div>
          </article>
        </section>

        <section className="gio-os-panel">
          <div className="gio-os-panel-head">
            <div>
              <p>Control trail</p>
              <h2>What changed in this workspace</h2>
            </div>
          </div>
          <div className="gio-os-log">
            {log.map((entry) => (
              <p key={entry}>{entry}</p>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
