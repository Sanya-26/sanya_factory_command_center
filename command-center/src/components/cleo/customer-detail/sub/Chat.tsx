// Chat — Cleo conversation transcript.

import type { CustomerDetailContext } from "../CustomerDetailLayout";

export function ChatPage({ ctx }: { ctx: CustomerDetailContext }): JSX.Element {
  return (
    <div className="cd-page cd-chat">
      <header className="cd-page-head">
        <h1>Cleo conversation</h1>
        <p>{ctx.chatMessages.length} messages with the customer during onboarding.</p>
      </header>
      {ctx.chatMessages.length === 0 ? (
        <div className="cd-empty">No messages yet — customer hasn't started talking to Cleo.</div>
      ) : (
        <div className="cd-transcript">
          {ctx.chatMessages.map((m: any) => (
            <div key={m.id} className={`cd-msg cd-msg-${m.role}`}>
              <div className="cd-msg-head">
                <strong>{m.role === "user" ? (ctx.company?.name ?? "Customer") : m.role === "assistant" ? "Cleo" : m.role}</strong>
                <span className="dim">{fmtTime(m.created_at)}</span>
                {m.source && m.source !== "customer" && m.source !== "cleo" ? (
                  <span className="cd-msg-source">{m.source}</span>
                ) : null}
              </div>
              <div className="cd-msg-body">{m.content}</div>
              {Array.isArray(m.tool_calls) && m.tool_calls.length > 0 ? (
                <details className="cd-msg-tools">
                  <summary>{m.tool_calls.length} tool call{m.tool_calls.length === 1 ? "" : "s"}</summary>
                  <pre>{JSON.stringify(m.tool_calls, null, 2)}</pre>
                </details>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
