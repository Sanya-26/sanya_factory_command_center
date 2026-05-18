// CleoOnboarding.tsx — the customer's onboarding stage.
//
// Customer just signed up. They land here. Two-pane: Cleo chat (left, 30%) +
// live business-map canvas (right, 70%). NO dashboard chrome — this is THE
// experience. The page disappears once their VPS is provisioned (gated by
// useOnboardingGate hook).
//
// Live data:
//   - onboarding_canvas_states (one row per company, upsert) — realtime sub
//   - onboarding_chat_messages (append-only) — realtime sub
//
// Chat backend:
//   - supabase.functions.invoke("cleo-onboarding-chat") — Cleo Edge Function
//     that handles the JWT, calls Anthropic, applies canvas mutations, writes
//     both rows. Customer's browser just sends the message + reads results.
//
// Send-to-AUBOS:
//   - POSTs the canvas + chat snapshot to the factory's /api/cleo/package
//     endpoint. Factory pipeline takes over from there.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
// AISubscriptionsGate moved to MeetingPicker.tsx (Phase 2 entry surface)
// per PROPOSAL_COUNCIL_DESIGN.md §3.7 third-pass revision + AUDIT_2026-05-12
// item 1. Onboarding (Phase 1) runs frictionless on central credentials.
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Position,
  MarkerType,
  Handle,
  type Node,
  type NodeProps,
  type Edge,
  ReactFlowProvider
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";

// Mono "blueprint" node — uniform white box with a small uppercase kind tag
// in the corner. In proposal mode (when data.automation is set), the border
// + a small badge convey automation status: green for AI, amber for human.
function MonoNode({ data }: NodeProps): JSX.Element {
  const d = data as {
    label?: string;
    sub?: string;
    subLabel?: string;
    automation?: "ai" | "user-action";
  };
  const automationCls = d.automation === "ai"
    ? "is-ai"
    : d.automation === "user-action"
    ? "is-user"
    : "";
  return (
    <div className={`aubos-onb-mono-node ${automationCls}`}>
      <Handle type="target" position={Position.Top} className="aubos-onb-mono-handle" />
      {d.sub ? <span className="kind-tag">{d.sub}</span> : null}
      {d.automation === "ai" ? (
        <span className="auto-badge auto-ai">AI</span>
      ) : d.automation === "user-action" ? (
        <span className="auto-badge auto-user">USER</span>
      ) : null}
      <span className="label">{d.label ?? ""}</span>
      {d.subLabel ? <small className="sub-label">{d.subLabel}</small> : null}
      <Handle type="source" position={Position.Bottom} className="aubos-onb-mono-handle" />
    </div>
  );
}
const NODE_TYPES = { mono: MonoNode };
import { supabase } from "@/integrations/supabase";
import { Loader2, Send, Package2, Sparkles, Mic, MicOff } from "lucide-react";
import { useMicCapture } from "@/lib/useMicCapture";
import { useCleoSTT } from "@/lib/useCleoSTT";
import { MicPermissionGate } from "@/components/MicPermissionGate";
import { startVoiceTurn, type VoiceTurn } from "@/lib/voiceTelemetry";
import { DocumentDropzone } from "@/components/onboarding/DocumentDropzone";
import { AudioVisualizer } from "@/components/AudioVisualizer";
import { useTalkingCleo } from "@/lib/useTalkingCleo";

interface CanvasNodeShape {
  id: string;
  kind: string;
  label: string;
  subLabel?: string;
  position?: { x: number; y: number };
  data?: Record<string, unknown>;
}
interface CanvasEdgeShape {
  id: string;
  source: string;
  target: string;
  kind?: string;
  label?: string;
}
interface CanvasState {
  company_id: string;
  nodes: CanvasNodeShape[];
  edges: CanvasEdgeShape[];
  business_type: string | null;
  status: "in-progress" | "sent-to-aubos" | "abandoned";
  last_activity_at: string;
  updated_at: string;
}

interface ChatMessage {
  id: string;
  company_id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  source: "customer" | "cleo" | "factory-synthetic";
  tool_calls: unknown[] | null;
  created_at: string;
}

// The "Send to AUBOS" action no longer hits the factory runtime directly
// from the browser. We route through the `cleo-package` Supabase edge fn
// which:
//   - validates the customer's Supabase JWT
//   - checks they own the company_id
//   - server-to-server forwards to runtime.aubos.ai
// This keeps the factory runtime token off the public bundle entirely.
// VITE_FACTORY_URL / VITE_FACTORY_RUNTIME_TOKEN are intentionally NOT
// referenced here — anything in the bundle is visible to every visitor.

// Inline toast — shows a transient message in the corner. Replaces shadcn's
// useToast hook so we don't need to pull in the whole shadcn ecosystem.
type ToastOpts = { title?: string; description?: string; variant?: "default" | "destructive" };
function useInlineToast() {
  const [t, setT] = useState<ToastOpts | null>(null);
  useEffect(() => {
    if (!t) return;
    const h = setTimeout(() => setT(null), 4500);
    return () => clearTimeout(h);
  }, [t]);
  return {
    toast: (opts: ToastOpts) => setT(opts),
    current: t,
    dismiss: () => setT(null),
  };
}

export default function CleoOnboarding(): JSX.Element {
  const navigate = useNavigate();
  const { toast, current: toastNow, dismiss: dismissToast } = useInlineToast();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string>("");
  const [companyWebsite, setCompanyWebsite] = useState<string>("");
  // S2.5 gate moved to MeetingPicker (Phase 2 entry) per §3.7 third pass.
  // Onboarding runs entirely on central credentials — no subscription gate.
  // S3: mic permission gate state. micPermissionResolved=false → render the
  // overlay on first visit. Once granted/denied/skipped it stays out of the
  // way; useMicCapture's own getUserMedia call surfaces any later denial.
  const [micPermissionResolved, setMicPermissionResolved] = useState<boolean>(false);
  // S3: mic active state — toggled by the mic button. When true, useCleoSTT
  // WS is open + useMicCapture is recording. Final transcripts flow into the
  // chat input + auto-submit.
  const [micEnabled, setMicEnabled] = useState<boolean>(false);
  const voiceTurnRef = useRef<VoiceTurn | null>(null);
  const [canvas, setCanvas] = useState<CanvasState | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState<string>("");
  const [sending, setSending] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [bootError, setBootError] = useState<string>("");
  const [canvasOpen, setCanvasOpen] = useState<boolean>(false);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  // Proposal-mode UI state.
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [proposalAccepting, setProposalAccepting] = useState<boolean>(false);
  // Live mirror of customer_secrets — realtime subscribed below.
  const [connectedIntegrations, setConnectedIntegrations] = useState<Set<string>>(new Set());
  // Modal state for the connect-integration form.
  const [connectModal, setConnectModal] = useState<{ id: string; label: string } | null>(null);
  const [connectSecret, setConnectSecret] = useState<string>("");
  const [connectSubmitting, setConnectSubmitting] = useState<boolean>(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Dev-mode flag — used to gate the "swap avatar" button. Requires
  // VITE_ENABLE_DEV_BYPASS=1 at build time AND ?dev=1 at runtime. Production
  // builds set neither, so this is dead code in prod.
  const isDev = import.meta.env.DEV &&
    import.meta.env.VITE_ENABLE_DEV_BYPASS === "1" &&
    typeof window !== "undefined" &&
    new URL(window.location.href).searchParams.get("dev") === "1";

  // Cleo's voice + lipsync — drives the 3D avatar's mouth via wawa-lipsync.
  const { lipsync, isSpeaking, speak, unlock: unlockTTS } = useTalkingCleo();
  // Track the last assistant message id we've already spoken so realtime
  // backfills don't replay the entire history every time.
  const spokenRef = useRef<Set<string>>(new Set());

  // Whenever a new assistant message lands, speak it through the avatar.
  useEffect(() => {
    const last = [...messages].reverse().find((m) => m.role === "assistant");
    if (!last) return;
    if (spokenRef.current.has(last.id)) return;
    spokenRef.current.add(last.id);
    speak(last.content);
    // Deliberately exclude `speak` from deps — its reference can change
    // on every render (it has internal callbacks), and re-running this
    // effect when speak changes would re-speak the last message. We only
    // want to fire when a NEW message arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  // Last assistant message — shown as a soft caption under Cleo while she
  // speaks. MUST live above the early-return guards so hook order is stable.
  const lastCleoMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return messages[i];
    }
    return null;
  }, [messages]);

  // ─── Boot: resolve company_id, load canvas + chat history ───────────────
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Dev-only bypass: /onboarding?dev=1 auto-signs-in the seed test
      // customer so we can smoke-test the 3D avatar + chat without going
      // through the signup form. Gated by THREE conditions:
      //   1. import.meta.env.DEV — Vite dev server only.
      //   2. VITE_ENABLE_DEV_BYPASS === "1" — opt-in env var (never set in prod).
      //   3. ?dev=1 query param — explicit per-request opt-in.
      // Plus a runtime guard that throws if MODE === "production".
      const url = new URL(window.location.href);
      const devBypass =
        import.meta.env.DEV &&
        import.meta.env.VITE_ENABLE_DEV_BYPASS === "1" &&
        url.searchParams.get("dev") === "1";

      if (devBypass) {
        if (import.meta.env.MODE === "production") {
          throw new Error("dev bypass invoked in production build — refusing");
        }
        // Credentials are read from env, not hardcoded — keeps secrets out of
        // the public JS bundle. VITE_DEV_TEST_EMAIL + VITE_DEV_TEST_PASSWORD
        // must be set in .env.local for the dev bypass to work; if missing,
        // the bypass falls through to the normal redirect-to-login path.
        const devEmail = import.meta.env.VITE_DEV_TEST_EMAIL as string | undefined;
        const devPw = import.meta.env.VITE_DEV_TEST_PASSWORD as string | undefined;
        if (!devEmail || !devPw) {
          console.warn("[onboarding dev] VITE_DEV_TEST_EMAIL/PASSWORD not set — skipping dev signin");
        } else {
          const { data: existing } = await supabase.auth.getSession();
          if (!existing.session?.user) {
            const { error: signInErr } = await supabase.auth.signInWithPassword({
              email: devEmail,
              password: devPw,
            });
            if (signInErr) {
              console.warn("[onboarding dev] auto-signin failed:", signInErr.message);
              if (!cancelled) setBootError(`dev signin: ${signInErr.message}`);
              return;
            }
            // Fall through to the normal path below — session is now live.
          }
        }
      }

      // Normal auth path
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        navigate("/login");
        return;
      }
      const { data: companyRow, error: cErr } = await supabase
        .from("companies")
        .select("id, name, home_website")
        .eq("user_id", session.user.id)
        .limit(1)
        .maybeSingle();
      if (cErr) {
        if (!cancelled) setBootError(`load company: ${cErr.message}`);
        return;
      }
      if (!companyRow) {
        if (!cancelled) {
          setBootError("No company on your account yet. Returning to signup…");
          setTimeout(() => navigate("/login"), 1800);
        }
        return;
      }
      const cid = companyRow.id as string;
      if (cancelled) return;
      setCompanyId(cid);
      setCompanyName(companyRow.name ?? "");
      setCompanyWebsite((companyRow as { home_website?: string }).home_website ?? "");

      // Load canvas
      const { data: canvasRow } = await supabase
        .from("onboarding_canvas_states")
        .select("*")
        .eq("company_id", cid)
        .maybeSingle();
      if (cancelled) return;
      if (canvasRow) {
        setCanvas(canvasRow as CanvasState);
      } else {
        // Lazy-create canvas row so realtime sub has something to subscribe to.
        const { data: created } = await supabase
          .from("onboarding_canvas_states")
          .insert({ company_id: cid, nodes: [], edges: [], status: "in-progress" })
          .select("*")
          .maybeSingle();
        if (created && !cancelled) setCanvas(created as CanvasState);
      }

      // Load chat history
      const { data: hist } = await supabase
        .from("onboarding_chat_messages")
        .select("*")
        .eq("company_id", cid)
        .order("created_at", { ascending: true })
        .limit(200);
      if (!cancelled && hist) setMessages(hist as ChatMessage[]);
    })();
    return () => { cancelled = true; };
  }, [navigate]);

  // ─── Initial load + realtime sub for customer_secrets ──────────────────
  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("customer_secrets")
        .select("integration_id, status")
        .eq("company_id", companyId);
      if (cancelled || !data) return;
      const next = new Set<string>();
      for (const r of data as Array<{ integration_id: string; status: string }>) {
        if (r.status === "connected") next.add(r.integration_id);
      }
      setConnectedIntegrations(next);
    })();
    const ch = supabase
      .channel(`onboarding-secrets-${companyId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "customer_secrets", filter: `company_id=eq.${companyId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as
            | { integration_id: string; status: string }
            | undefined;
          if (!row) return;
          setConnectedIntegrations((prev) => {
            const next = new Set(prev);
            if (payload.new && (payload.new as any).status === "connected") {
              next.add((payload.new as any).integration_id);
            } else {
              next.delete(row.integration_id);
            }
            return next;
          });
        },
      )
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(ch);
    };
  }, [companyId]);

  // ─── Realtime subs: chat + canvas ───────────────────────────────────────
  useEffect(() => {
    if (!companyId) return;
    const chatCh = supabase
      .channel(`onboarding-chat-${companyId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "onboarding_chat_messages", filter: `company_id=eq.${companyId}` },
        (payload) => {
          setMessages((prev) => {
            // Skip if we already have it (e.g. optimistic insert)
            const next = payload.new as ChatMessage;
            if (prev.some((m) => m.id === next.id)) return prev;
            return [...prev, next];
          });
        }
      )
      .subscribe();
    const canvasCh = supabase
      .channel(`onboarding-canvas-${companyId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "onboarding_canvas_states", filter: `company_id=eq.${companyId}` },
        (payload) => {
          if (payload.new) setCanvas(payload.new as CanvasState);
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(chatCh);
      void supabase.removeChannel(canvasCh);
    };
  }, [companyId]);

  // ─── Auto-scroll chat to bottom on new messages ─────────────────────────
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
    // Also scroll the chat history panel — it has its own scroll container.
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages.length]);

  // ─── Send a chat message via the Edge Function ──────────────────────────
  // sendText — submits one message to cleo-onboarding-chat. Extracted so the
  // STT 'final' callback can submit without round-tripping through `input`
  // (which would race with React state updates).
  const sendText = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending || !companyId) return;
    setSending(true);
    setInput("");
    // S3 telemetry — log chat-request stage if a voice turn is active.
    voiceTurnRef.current?.log("chat-request", { len: trimmed.length });
    try {
      const { data, error } = await supabase.functions.invoke("cleo-onboarding-chat", {
        body: { message: trimmed }
      });
      if (error) throw new Error(error.message);
      voiceTurnRef.current?.log("chat-final");
      // Edge function inserts both user + assistant rows; realtime sub delivers.
      void data;
    } catch (e) {
      toast({
        title: "Couldn't reach Cleo",
        description: (e as Error).message,
        variant: "destructive"
      });
    } finally {
      setSending(false);
    }
  }, [sending, companyId, toast]);

  const sendMessage = useCallback(async () => {
    await sendText(input);
  }, [input, sendText]);

  // ─── S3: voice loop wiring ──────────────────────────────────────────────
  const stt = useCleoSTT({
    onFinal: (text) => {
      voiceTurnRef.current?.log("stt-final", { len: text.length });
      if (text.trim()) void sendText(text);
      // Start the next turn's session right away so any follow-on speech
      // gets its own session_id in telemetry.
      if (companyId) voiceTurnRef.current = startVoiceTurn(companyId);
    },
  });
  const mic = useMicCapture({
    onChunk: (chunk) => stt.sendChunk(chunk),
  });

  const toggleMic = useCallback(async () => {
    if (!companyId) return;
    if (micEnabled) {
      mic.stop();
      stt.close();
      setMicEnabled(false);
      voiceTurnRef.current = null;
      return;
    }
    // Starting: open WS first so the first audio chunks land somewhere.
    voiceTurnRef.current = startVoiceTurn(companyId);
    voiceTurnRef.current.log("mic-start");
    await stt.connect();
    await mic.start();
    setMicEnabled(true);
  }, [companyId, micEnabled, mic, stt]);

  // Auto-stop the mic if speaking starts somehow without permission resolved.
  useEffect(() => {
    return () => {
      // Component unmount: belt-and-suspenders cleanup (the hooks also self-clean).
      mic.stop();
      stt.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Send to AUBOS team — packages + ships to factory ───────────────────
  //
  // Flow: browser → cleo-package edge fn (validates JWT + ownership) →
  // runtime.aubos.ai (Cloudflare Tunnel → factory VPS). The factory runtime
  // token NEVER touches the bundle — it lives only as a Supabase Function
  // Secret inside cleo-package.
  const sendToAubosTeam = useCallback(async () => {
    if (!companyId || !canvas || submitting) return;
    setSubmitting(true);
    try {
      // Snapshot the current chat (optimistic — realtime may not have arrived yet)
      const { data: latestChat } = await supabase
        .from("onboarding_chat_messages")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: true })
        .limit(500);

      // supabase.functions.invoke() automatically attaches the user's JWT
      // as `Authorization: Bearer <jwt>`. The edge fn validates it +
      // ownership, then forwards to the factory runtime.
      const { data, error } = await supabase.functions.invoke("cleo-package", {
        body: {
          companyId,
          companySlug: companyWebsite ? new URL(companyWebsite.startsWith("http") ? companyWebsite : `https://${companyWebsite}`).hostname.replace(/^www\./, "").split(".")[0] : "",
          priority: "p1",
          customer: {
            name: companyName || "—",
            email: (await supabase.auth.getUser()).data.user?.email ?? "",
            website: companyWebsite ?? ""
          },
          scrape: {
            businessType: canvas.business_type ?? "unknown",
            integrationsDetected: []
          },
          canvas: {
            businessType: canvas.business_type ?? "unknown",
            nodes: canvas.nodes ?? [],
            edges: canvas.edges ?? []
          },
          chatHistory: (latestChat ?? []).map((m) => ({
            role: m.role,
            content: m.content,
            at: m.created_at
          }))
        }
      });
      if (error) throw new Error(error.message);
      void data;

      // Mark canvas state
      await supabase
        .from("onboarding_canvas_states")
        .update({ status: "sent-to-aubos", last_activity_at: new Date().toISOString() })
        .eq("company_id", companyId);

      toast({
        title: "Sent to the team",
        description: "We'll be back with a plan shortly. You can keep chatting if anything changes.",
      });
    } catch (e) {
      toast({
        title: "Couldn't send to team",
        description: (e as Error).message,
        variant: "destructive"
      });
    } finally {
      setSubmitting(false);
    }
  }, [companyId, canvas, submitting, companyName, companyWebsite, toast]);

  // ─── Adapt canvas state to xyflow format with dagre layout ──────────────
  const { flowNodes, flowEdges } = useMemo(() => {
    if (!canvas) return { flowNodes: [] as Node[], flowEdges: [] as Edge[] };

    // Step 1: build raw node + edge lists
    const rawNodes: Node[] = (canvas.nodes ?? []).map((n: CanvasNodeShape) => ({
      id: n.id,
      data: {
        label: n.label ?? n.id,
        sub: kindLabel(n.kind),
        subLabel: n.subLabel,
        kind: n.kind,
        ...n.data
      },
      position: { x: 0, y: 0 },
      type: "mono"
    }));
    const rawEdges: Edge[] = (canvas.edges ?? []).map((e: CanvasEdgeShape) => {
      const style = edgeStyleByKind(e.kind);
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label ?? e.kind,
        type: "smoothstep",
        animated: style.animated,
        markerEnd: { type: MarkerType.ArrowClosed, color: style.color },
        style: { stroke: style.color, strokeWidth: style.width, strokeDasharray: style.dash },
        labelStyle: { fill: style.color, fontSize: 9.5, fontFamily: "ui-monospace, monospace", letterSpacing: "0.05em" },
        labelBgStyle: { fill: "rgba(0,0,0,0.55)" },
        labelBgPadding: [4, 2] as [number, number],
        labelBgBorderRadius: 2
      };
    });

    // Step 2: dagre top-down layout. Wider ranksep so the flow direction is
    // visually obvious; tighter nodesep so siblings cluster.
    const g = new dagre.graphlib.Graph();
    g.setGraph({
      rankdir: "TB",
      nodesep: 40,
      ranksep: 110,
      edgesep: 24,
      marginx: 40,
      marginy: 40,
      ranker: "tight-tree"
    });
    g.setDefaultEdgeLabel(() => ({}));
    rawNodes.forEach((n) => g.setNode(n.id, { width: 220, height: 90 }));
    // Edge weights: structural "contains" edges get higher weight so dagre
    // anchors children right under their area; cross-area "reads/triggers"
    // edges are weaker so they're allowed to bend without pulling layout.
    rawEdges.forEach((e) => {
      const weight = e.label === "contains" ? 4 : 1;
      g.setEdge(e.source, e.target, { weight });
    });
    dagre.layout(g);

    const positioned = rawNodes.map((n) => {
      const pos = g.node(n.id);
      return pos
        ? { ...n, position: { x: pos.x - 100, y: pos.y - 40 } }
        : n;
    });

    return { flowNodes: positioned, flowEdges: rawEdges };
  }, [canvas]);

  // ─── Render ─────────────────────────────────────────────────────────────
  if (bootError) {
    return (
      <div className="aubos-onboarding-error">
        <Sparkles className="h-12 w-12 mb-4 opacity-60" />
        <p>{bootError}</p>
      </div>
    );
  }
  if (!companyId || !canvas) {
    return (
      <div className="aubos-onboarding-loading">
        <Loader2 className="h-8 w-8 animate-spin mb-4 opacity-60" />
        <p>Setting up your onboarding…</p>
      </div>
    );
  }
  const sentToAubos = canvas.status === "sent-to-aubos";

  // Proposal mode = the architect's automation tags landed on the canvas.
  const proposalMode = (canvas.nodes ?? []).some(
    (n) => (n.data as { automation?: string } | undefined)?.automation,
  );
  const integrationNodes = (canvas.nodes ?? []).filter((n) => n.kind === "integration");
  const automatableCount = (canvas.nodes ?? []).filter(
    (n) => (n.data as { automation?: string } | undefined)?.automation === "ai",
  ).length;
  const userActionCount = (canvas.nodes ?? []).filter(
    (n) => (n.data as { automation?: string } | undefined)?.automation === "user-action",
  ).length;
  const totalSavingPerMonth = (canvas.nodes ?? []).reduce((sum, n) => {
    const v = (n.data as { estimated_monthly_saving_usd?: number } | undefined)
      ?.estimated_monthly_saving_usd;
    return sum + (typeof v === "number" ? v : 0);
  }, 0);
  const selectedNode = selectedNodeId
    ? (canvas.nodes ?? []).find((n) => n.id === selectedNodeId)
    : null;

  // Integration gating — every integration node on the canvas is required by
  // default; the architect can opt one out by setting data.required === false.
  const requiredIntegrations = integrationNodes.filter(
    (n) => (n.data as { required?: boolean } | undefined)?.required !== false,
  );
  const missingIntegrations = requiredIntegrations.filter((n) => {
    const id = (n.data as { provider?: string } | undefined)?.provider ?? n.id;
    return !connectedIntegrations.has(id);
  });
  const acceptDisabled = proposalAccepting || missingIntegrations.length > 0;

  const acceptProposal = async () => {
    if (acceptDisabled || !companyId) return;
    setProposalAccepting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Sign in expired — refresh and try again.");
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/accept-proposal`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
        },
        body: JSON.stringify({ company_id: companyId }),
      });
      if (!res.ok) {
        const txt = await res.text();
        let detail = txt.slice(0, 300);
        try {
          const parsed = JSON.parse(txt);
          if (res.status === 412 && Array.isArray(parsed.missing)) {
            const names = parsed.missing.map((m: { label: string }) => m.label).join(", ");
            detail = `Connect these first: ${names}`;
          } else if (parsed.error) {
            detail = parsed.error;
          }
        } catch { /* ignore */ }
        throw new Error(detail);
      }
      toast({
        title: "Proposal accepted",
        description: "Next: connect your AI accounts so the factory can build for you.",
      });
      // AUDIT_2026-05-12 item 2 — navigate to /meeting (Phase 2 entry surface).
      // MeetingPicker hosts the AISubscriptionsGate; customer connects Claude
      // Pro + ChatGPT Pro there, then picks a kickoff slot.
      navigate("/meeting");
    } catch (e) {
      toast({
        title: "Couldn't accept proposal",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setProposalAccepting(false);
    }
  };

  return (
    <div className="aubos-onb-stage">
      {/* ─── Top bar ─────────────────────────────────────────────────
          Minimal: brand on the left, primary action ("Send to AUBOS")
          + map toggle + sign-out on the right. Send-to-AUBOS lives up
          here (not in the input bar) because it's a flow-end action,
          not a per-message action. */}
      <header className="aubos-onb-header">
        <div className="aubos-onb-brand">
          <strong>AUBOS</strong>
          <small>· {proposalMode ? "proposal" : "onboarding"}</small>
          {companyName ? (
            <span className="aubos-onb-company-chip">{companyName}</span>
          ) : null}
        </div>
        <div className="aubos-onb-header-actions">
          <button
            type="button"
            className="aubos-onb-header-link"
            onClick={() => setCanvasOpen((v) => !v)}
            title={canvasOpen ? "Hide business map" : "Show business map"}
          >
            <span className="aubos-onb-header-link-num">{(canvas.nodes ?? []).length}</span>
            <span>{canvasOpen ? "hide map" : "map"}</span>
          </button>
          <button
            type="button"
            className="aubos-onb-send-team-btn"
            onClick={() => void sendToAubosTeam()}
            disabled={submitting || sentToAubos || (canvas.nodes?.length ?? 0) === 0}
            title={sentToAubos ? "Already sent" : "Send your business map to the AUBOS team"}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> :
             sentToAubos ? <><Package2 className="h-[14px] w-[14px]" /> Sent</> :
             <><Package2 className="h-[14px] w-[14px]" /> Send to AUBOS</>}
          </button>
          <button
            type="button"
            className="aubos-onb-signout"
            onClick={async () => {
              try { await supabase.auth.signOut(); } catch { /* */ }
              navigate("/login");
            }}
            title="Sign out"
            aria-label="Sign out"
          >
            sign out
          </button>
        </div>
      </header>

      {/* ─── Proposal banner (only when a council proposal is ready) ─── */}
      {proposalMode && !sentToAubos ? (
        <div className="aubos-onb-proposal-banner">
          <div className="aubos-onb-proposal-stats">
            <span><strong>{automatableCount}</strong> automated</span>
            <span><strong>{userActionCount}</strong> human</span>
            <span><strong>{integrationNodes.length}</strong> integrations</span>
            {totalSavingPerMonth > 0 ? (
              <span><strong>${Math.round(totalSavingPerMonth)}</strong>/mo saved</span>
            ) : null}
          </div>
          <button
            type="button"
            className="aubos-onb-proposal-accept"
            disabled={acceptDisabled}
            onClick={() => void acceptProposal()}
          >
            {proposalAccepting
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : missingIntegrations.length > 0
                ? <>Connect {missingIntegrations.length} more to accept</>
                : <>Accept · build my AI →</>}
          </button>
        </div>
      ) : null}

      {/* ─── Conversation column (Pi/Inflection layout) ───────────────
          Single 720px max-width column, centered horizontally. Three
          stacked sections: orb on top, message feed in the middle,
          input pinned at the bottom of the column. */}
      <main className="aubos-onb-shell" onClick={() => unlockTTS()}>

        {/* Voice orb — smaller than before (~30vh), provides focal
            point + visual indicator that she's listening / speaking. */}
        <section className="aubos-onb-orb-wrap" aria-hidden="true">
          <AudioVisualizer lipsync={lipsync} isSpeaking={isSpeaking} className="aubos-onb-orb-canvas" />
        </section>

        {/* Message feed — full conversation history as bubbles. User
            right-aligned violet, Cleo left-aligned neutral. Auto-scrolls
            on new messages via chatScrollRef. */}
        <section className="aubos-onb-feed" ref={chatScrollRef}>
          {messages.length === 0 ? (
            <div className="aubos-onb-feed-empty">
              Say hi or type a message — Cleo's listening.
            </div>
          ) : messages.map((m) => (
            <div
              key={m.id}
              className={`aubos-onb-msg ${m.role === "user" ? "from-user" : "from-cleo"}`}
            >
              <div className="aubos-onb-msg-body">{m.content}</div>
              <div className="aubos-onb-msg-time">
                {new Date(m.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              </div>
            </div>
          ))}
          {/* Live partial transcript — appears as an in-progress user message */}
          {micEnabled && stt.partial ? (
            <div className="aubos-onb-msg from-user partial">
              <div className="aubos-onb-msg-body">{stt.partial}<span className="aubos-onb-msg-caret">…</span></div>
            </div>
          ) : null}
          {/* Typing indicator — appears as an in-progress Cleo message */}
          {sending ? (
            <div className="aubos-onb-msg from-cleo typing">
              <div className="aubos-onb-msg-body">
                <span className="aubos-onb-typing-dot" />
                <span className="aubos-onb-typing-dot" />
                <span className="aubos-onb-typing-dot" />
              </div>
            </div>
          ) : null}
          <div ref={chatBottomRef} />
        </section>

        {/* Input — bottom of the conversation column. NOT absolutely
            positioned anymore; flows naturally inside the shell. */}
        <footer className="aubos-onb-input-bar">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void sendMessage();
              }
            }}
            placeholder={sending ? "Cleo is thinking…" : "Message Cleo…"}
            disabled={sending || sentToAubos}
            rows={1}
          />
          <button
            type="button"
            onClick={() => void toggleMic()}
            disabled={sending || sentToAubos}
            className={`aubos-onb-mic-btn ${micEnabled ? "active" : ""}`}
            aria-label={micEnabled ? "Stop listening" : "Talk to Cleo"}
            title={micEnabled ? "Stop listening" : "Talk to Cleo"}
          >
            {micEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
          </button>
          <button
            type="button"
            onClick={() => void sendMessage()}
            disabled={sending || sentToAubos || !input.trim()}
            className="aubos-onb-send-btn"
            aria-label="Send"
          >
            {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-[18px] w-[18px]" />}
          </button>
        </footer>
      </main>

      {/* First-time mic permission overlay — persists dismissal */}
      {!micPermissionResolved ? (
        <MicPermissionGate onResolved={() => setMicPermissionResolved(true)} />
      ) : null}

      {/* Document drop zone — floating left-bottom corner */}
      <DocumentDropzone companyId={companyId} />

      {/* Canvas drawer — slides in from the right */}
      <aside className={`aubos-onb-drawer ${canvasOpen ? "open" : ""}`}>
        <div className="aubos-onb-drawer-head">
          <strong>Your business map</strong>
          <small>{(canvas.nodes ?? []).length} nodes · {(canvas.edges ?? []).length} connections</small>
          <button
            type="button"
            className="aubos-onb-drawer-close"
            onClick={() => setCanvasOpen(false)}
            aria-label="Close canvas"
          >
            ×
          </button>
        </div>
        <div className="aubos-onb-drawer-body">
          <ReactFlowProvider>
            <ReactFlow
              nodes={flowNodes}
              edges={flowEdges}
              nodeTypes={NODE_TYPES}
              fitView
              proOptions={{ hideAttribution: true }}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={proposalMode}
              onNodeClick={proposalMode ? (_, n) => setSelectedNodeId(n.id) : undefined}
            >
              <Background gap={24} size={1} />
              <Controls showInteractive={false} />
              <MiniMap
                pannable
                zoomable
                nodeColor={() => "rgba(255, 255, 255, 0.55)"}
                nodeStrokeColor={() => "rgba(255, 255, 255, 0.85)"}
                nodeStrokeWidth={2}
                nodeBorderRadius={2}
                maskColor="rgba(0, 0, 0, 0.6)"
              />
            </ReactFlow>
          </ReactFlowProvider>
        </div>
      </aside>

      {/* Backdrop to close drawer when clicked outside */}
      {canvasOpen ? (
        <div className="aubos-onb-drawer-backdrop" onClick={() => setCanvasOpen(false)} />
      ) : null}

      {/* (Old side-panel chat history removed — the main column IS the
           chat history now. The canvas drawer below still slides in for
           the business map on demand.) */}

      {/* Integration login rail — only in proposal mode, sits on the left edge. */}
      {proposalMode && integrationNodes.length > 0 ? (
        <aside className="aubos-onb-int-rail">
          <header>
            <strong>Connect your tools</strong>
            <small>{connectedIntegrations.size} of {integrationNodes.length} connected</small>
          </header>
          <ul>
            {integrationNodes.map((n) => {
              const id = (n.data as { provider?: string } | undefined)?.provider ?? n.id;
              const connected = connectedIntegrations.has(id);
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    className={`aubos-onb-int-tile ${connected ? "connected" : ""}`}
                    onClick={() => {
                      if (connected) return;
                      setConnectModal({ id, label: n.label });
                      setConnectSecret("");
                      setConnectError(null);
                    }}
                  >
                    <span className="dot" />
                    <span className="name">{n.label}</span>
                    <span className="status">{connected ? "✓" : "connect"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>
      ) : null}

      {/* Connect-integration modal — paste API token to encrypt + persist. */}
      {connectModal ? (
        <div className="aubos-onb-modal-backdrop" onClick={() => setConnectModal(null)}>
          <div
            className="aubos-onb-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label={`Connect ${connectModal.label}`}
          >
            <header>
              <strong>Connect {connectModal.label}</strong>
              <button type="button" onClick={() => setConnectModal(null)} aria-label="Close">×</button>
            </header>
            <div className="aubos-onb-modal-body">
              <p>
                Paste your <strong>{connectModal.label}</strong> API key or access token below.
                It's encrypted server-side and only readable by your AI agent.
              </p>
              <input
                type="password"
                placeholder={`${connectModal.label} secret`}
                value={connectSecret}
                onChange={(e) => setConnectSecret(e.target.value)}
                autoFocus
                disabled={connectSubmitting}
              />
              {connectError ? <p className="aubos-onb-modal-error">{connectError}</p> : null}
              <div className="aubos-onb-modal-actions">
                <button
                  type="button"
                  className="aubos-onb-modal-cancel"
                  onClick={() => setConnectModal(null)}
                  disabled={connectSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="aubos-onb-modal-save"
                  disabled={connectSubmitting || !connectSecret.trim() || !companyId}
                  onClick={async () => {
                    if (!companyId || !connectModal) return;
                    setConnectSubmitting(true);
                    setConnectError(null);
                    try {
                      const { data: { session } } = await supabase.auth.getSession();
                      const token = session?.access_token;
                      if (!token) throw new Error("Sign in expired — refresh and try again.");
                      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/connect-integration`;
                      const res = await fetch(url, {
                        method: "POST",
                        headers: {
                          "content-type": "application/json",
                          authorization: `Bearer ${token}`,
                          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
                        },
                        body: JSON.stringify({
                          company_id: companyId,
                          integration_id: connectModal.id,
                          secret_value: connectSecret.trim(),
                        }),
                      });
                      if (!res.ok) {
                        const txt = await res.text();
                        throw new Error(`${res.status}: ${txt.slice(0, 200)}`);
                      }
                      setConnectModal(null);
                    } catch (e) {
                      setConnectError((e as Error).message);
                    } finally {
                      setConnectSubmitting(false);
                    }
                  }}
                >
                  {connectSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save & connect →"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Node detail drawer — opens when a node is clicked in proposal mode. */}
      {selectedNode ? (
        <aside className="aubos-onb-node-detail">
          <header>
            <div>
              <strong>{selectedNode.label}</strong>
              <small>{kindLabel(selectedNode.kind)}</small>
            </div>
            <button type="button" onClick={() => setSelectedNodeId(null)} aria-label="Close">×</button>
          </header>
          <div className="aubos-onb-node-detail-body">
            {(() => {
              const d = selectedNode.data as
                | {
                    automation?: "ai" | "user-action";
                    aubos_components?: string[];
                    process_explanation?: string;
                    estimated_monthly_saving_usd?: number;
                  }
                | undefined;
              return (
                <>
                  {d?.automation ? (
                    <div className="field">
                      <label>automation</label>
                      <span className={`auto-badge ${d.automation === "ai" ? "auto-ai" : "auto-user"}`}>
                        {d.automation === "ai" ? "AI handles this" : "Human action required"}
                      </span>
                    </div>
                  ) : null}
                  {d?.process_explanation ? (
                    <div className="field">
                      <label>what we do</label>
                      <p>{d.process_explanation}</p>
                    </div>
                  ) : null}
                  {d?.aubos_components && d.aubos_components.length > 0 ? (
                    <div className="field">
                      <label>AUBOS components</label>
                      <ul>
                        {d.aubos_components.map((c) => <li key={c}>{c}</li>)}
                      </ul>
                    </div>
                  ) : null}
                  {typeof d?.estimated_monthly_saving_usd === "number" && d.estimated_monthly_saving_usd > 0 ? (
                    <div className="field">
                      <label>est. monthly saving</label>
                      <p>${Math.round(d.estimated_monthly_saving_usd)}</p>
                    </div>
                  ) : null}
                </>
              );
            })()}
          </div>
        </aside>
      ) : null}

      {/* Inline toast — bottom-right, auto-dismisses after a few seconds. */}
      {toastNow ? (
        <div
          role="status"
          onClick={dismissToast}
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 50,
            maxWidth: 360,
            padding: "10px 14px",
            borderRadius: 8,
            cursor: "pointer",
            background: toastNow.variant === "destructive" ? "rgba(127, 29, 29, 0.92)" : "rgba(15, 15, 15, 0.92)",
            border: `1px solid ${toastNow.variant === "destructive" ? "rgba(248, 113, 113, 0.4)" : "rgba(255, 255, 255, 0.15)"}`,
            color: "rgba(255, 255, 255, 0.92)",
            fontFamily: "ui-sans-serif, system-ui",
            fontSize: "0.78rem",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
          }}
        >
          {toastNow.title ? <div style={{ fontWeight: 600, marginBottom: toastNow.description ? 4 : 0 }}>{toastNow.title}</div> : null}
          {toastNow.description ? <div style={{ opacity: 0.7 }}>{toastNow.description}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

/** Monochrome white card — same look for every kind. The kind shows as a
 * tiny uppercase tag in the label text so the type is visible without
 * relying on color. Architecture-diagram aesthetic, not a kindergarten map. */
function monoNodeStyle(_kind: string | undefined): React.CSSProperties {
  return {
    fontSize: "0.74rem",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    padding: "12px 16px",
    borderRadius: "4px",
    border: "1px solid rgba(255, 255, 255, 0.55)",
    background: "rgba(255, 255, 255, 0.04)",
    color: "#ededed",
    minWidth: "180px",
    minHeight: "60px",
    textAlign: "left",
    boxShadow: "0 0 0 0.5px rgba(255,255,255,0.15) inset"
  };
}

/** Edge style per relationship kind — eye disambiguates flows by color. */
function edgeStyleByKind(kind: string | undefined): {
  color: string; width: number; dash?: string; animated: boolean;
} {
  switch (kind) {
    case "contains":
      // Area → Process · structural · dim, thin, no animation, no arrow emphasis
      return { color: "rgba(255, 255, 255, 0.18)", width: 1, dash: "1 4", animated: false };
    case "reads":
      // Process → Data · "this process consumes this data" · cool blue, dashed
      return { color: "rgba(96, 165, 250, 0.75)", width: 1.4, dash: "5 3", animated: false };
    case "triggers":
      // Process → Integration · "this process fires this tool" · amber, animated
      return { color: "rgba(251, 191, 36, 0.85)", width: 1.6, animated: true };
    case "flows-to":
    case "feeds":
    case "leads-to":
      // Process → Process · "this leads into that" · bright white, thicker, animated
      return { color: "rgba(255, 255, 255, 0.85)", width: 1.8, animated: true };
    case "blocks":
      // Pain ↔ Process · the bottleneck · red, no animation
      return { color: "rgba(248, 113, 113, 0.85)", width: 1.4, animated: false };
    default:
      return { color: "rgba(255, 255, 255, 0.55)", width: 1.4, animated: false };
  }
}

/** Tiny uppercase label for the kind (shown as a sub-tag inside the node). */
function kindLabel(kind: string | undefined): string {
  switch (kind) {
    case "business-area": return "AREA";
    case "process": return "PROCESS";
    case "data-source": return "DATA";
    case "integration": return "INTEGRATION";
    case "pain-point": return "PAIN";
    default: return "NODE";
  }
}
