// Full-page Board Snapshot view (also reachable from the Home page header).

import { BoardSnapshotDeck } from "../../components/BoardSnapshotDeck";

export function CeoBoardSnapshotPage(): JSX.Element {
  return (
    <div style={{ padding: 24, maxWidth: 900, display: "grid", gap: 16 }}>
      <header>
        <h1 style={{ margin: 0 }}>Board snapshot</h1>
        <p style={{ color: "#9ca3af", margin: "4px 0 0", fontSize: 13 }}>8-slide monthly digest. Present full-screen or export to PDF.</p>
      </header>
      <BoardSnapshotDeck embedded={false} />
    </div>
  );
}
