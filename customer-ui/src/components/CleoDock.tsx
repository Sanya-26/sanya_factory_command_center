// CleoDock — Phase 4 · Cleo embedded on every customer-portal page.
//
// Right-side dock by default; collapsible to a floating bubble. Cleo gets the
// current page's context automatically (route, visible records). Chats route
// through the customer's VPS's OpenClaw /goal endpoint via a Supabase Edge
// Function that the customer's harness exposes at /functions/v1/cleo-chat.
//
// Canvas artifacts (FortuneSheet workbooks, HTML reports, slide decks) appear
// in the same dock — Realtime-subscribed to canvas_artifacts table.

import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase";
import { Loader2, MessageSquare, X, Send, Minimize2, Maximize2 } from "lucide-react";

interface CleoDockProps {
  companyId: string;
  pageContext?: {
    route: string;
    visibleRecords?: Record<string, unknown>;
  };
}

interface ChatMessage {
  id: string;
  role: "user" | "cleo";
  text: string;
  at: string;
  artifact_id?: string;
}

interface CanvasArtifact {
  id: string;
  kind: string;
  title: string | null;
  content: unknown;
  created_at: string;
}

export default function CleoDock({ companyId, pageContext }: CleoDockProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [artifacts, setArtifacts] = useState<CanvasArtifact[]>([]);
  const [activeTab, setActiveTab] = useState<"chat" | "canvas">("chat");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Realtime subscription to canvas_artifacts.
  useEffect(() => {
    if (!companyId) return;
    void (async () => {
      const { data } = await supabase
        .from("canvas_artifacts")
        .select("id, kind, title, content, created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(20);
      setArtifacts((data ?? []) as CanvasArtifact[]);
    })();
    const ch = supabase
      .channel(`cleo-canvas-${companyId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "canvas_artifacts", filter: `company_id=eq.${companyId}` },
        (payload) => {
          setArtifacts((prev) => [payload.new as CanvasArtifact, ...prev].slice(0, 20));
          // Auto-flip to canvas tab when a new artifact arrives.
          setOpen(true);
          setActiveTab("canvas");
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [companyId]);

  // Auto-scroll chat to bottom on new message.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text,
      at: new Date().toISOString(),
    };
    setMessages((m) => [...m, userMsg]);
    setInput("");

    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) throw new Error("not authenticated");
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cleo-chat`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          company_id: companyId,
          message: text,
          page_context: pageContext,
        }),
      });
      const body = await res.json();
      const reply: ChatMessage = {
        id: crypto.randomUUID(),
        role: "cleo",
        text: body.reply ?? body.error ?? "(no reply)",
        at: new Date().toISOString(),
        artifact_id: body.artifact_id,
      };
      setMessages((m) => [...m, reply]);
    } catch (err) {
      setMessages((m) => [...m, {
        id: crypto.randomUUID(),
        role: "cleo",
        text: `Something broke on my end — ${(err as Error).message}. Try again?`,
        at: new Date().toISOString(),
      }]);
    } finally {
      setSending(false);
    }
  }, [input, sending, companyId, pageContext]);

  if (!open) {
    return (
      <button
        type="button"
        className="cleo-dock-bubble"
        onClick={() => setOpen(true)}
        aria-label="Open Cleo"
      >
        <MessageSquare size={20} />
      </button>
    );
  }

  return (
    <aside className={`cleo-dock ${minimized ? "is-minimized" : ""}`}>
      <header className="cleo-dock-head">
        <strong>Cleo</strong>
        <nav className="cleo-dock-tabs">
          <button
            className={activeTab === "chat" ? "active" : ""}
            onClick={() => setActiveTab("chat")}
          >
            Chat
          </button>
          <button
            className={activeTab === "canvas" ? "active" : ""}
            onClick={() => setActiveTab("canvas")}
          >
            Canvas {artifacts.length > 0 && <span className="badge">{artifacts.length}</span>}
          </button>
        </nav>
        <div className="cleo-dock-actions">
          <button onClick={() => setMinimized(!minimized)} aria-label="Minimize">
            {minimized ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
          </button>
          <button onClick={() => setOpen(false)} aria-label="Close">
            <X size={14} />
          </button>
        </div>
      </header>

      {!minimized && (
        <>
          {activeTab === "chat" && (
            <>
              <div className="cleo-dock-body" ref={scrollRef}>
                {messages.length === 0 ? (
                  <div className="cleo-dock-empty">
                    I'm watching everything that's happening across your business. Ask me anything — pipeline, revenue, what's on fire today.
                  </div>
                ) : (
                  messages.map((m) => (
                    <div key={m.id} className={`cleo-msg ${m.role}`}>
                      <span className="role">{m.role === "cleo" ? "Cleo" : "You"}</span>
                      <div className="text">{m.text}</div>
                    </div>
                  ))
                )}
                {sending && (
                  <div className="cleo-msg cleo">
                    <span className="role">Cleo</span>
                    <div className="text"><Loader2 size={12} className="spin" /> thinking…</div>
                  </div>
                )}
              </div>
              <footer className="cleo-dock-input">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  placeholder="Ask Cleo…"
                  disabled={sending}
                  rows={1}
                />
                <button onClick={() => void send()} disabled={!input.trim() || sending}>
                  <Send size={14} />
                </button>
              </footer>
            </>
          )}

          {activeTab === "canvas" && (
            <div className="cleo-dock-canvas">
              {artifacts.length === 0 ? (
                <div className="cleo-dock-empty">No canvas artifacts yet. When I produce a report, dashboard, or document for you, it lands here.</div>
              ) : (
                <ul className="cleo-canvas-list">
                  {artifacts.map((a) => (
                    <li key={a.id} className={`cleo-canvas-item kind-${a.kind}`}>
                      <span className="kind-tag">{a.kind}</span>
                      <span className="title">{a.title ?? `untitled ${a.kind}`}</span>
                      <small>{new Date(a.created_at).toLocaleString()}</small>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </aside>
  );
}
