// useCleoSTT — WebSocket client for the cleo-stt edge function (proposal §1.4 / S3).
//
// Owns a WebSocket to the cleo-stt edge fn. The fn proxies our audio frames
// to Deepgram Nova-2 streaming and sends back {type:'partial'|'final', text,
// confidence} JSON messages. We surface them via callbacks. The caller pairs
// this with useMicCapture (which produces opus chunks) — for each chunk we
// send it as a binary frame.
//
// Auth: the JWT is passed in the Sec-WebSocket-Protocol header as
// `bearer.<jwt>` (browsers can't set Authorization on a WS handshake). The
// edge fn validates BEFORE upgrading.
//
// Latency budget for the round trip: end-of-user-speech → Cleo first TTS
// audio byte < 2.5s (300ms STT final + ~1.2s LLM first-token + ~700ms TTS
// first-byte + ~300ms network). This hook only owns the STT slice.

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase";

const DEFAULT_STT_URL =
  (import.meta.env.VITE_CLEO_STT_URL as string | undefined) ??
  derivedStttUrl();

function derivedStttUrl(): string {
  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!base) return "";
  // Project URL → functions URL → wss
  // e.g. https://jzppqxiprjsuvuyulbyj.supabase.co → wss://jzppqxiprjsuvuyulbyj.functions.supabase.co/cleo-stt
  try {
    const u = new URL(base);
    const host = u.host.replace(".supabase.co", ".functions.supabase.co");
    return `wss://${host}/cleo-stt`;
  } catch {
    return "";
  }
}

export type SttStatus = "idle" | "connecting" | "ready" | "error" | "closed";

export interface CleoSTT {
  status: SttStatus;
  error: string | null;
  /** Last partial transcript (overwritten as Deepgram refines). */
  partial: string;
  /** Connect WS + emit a 'ready' callback once Deepgram is reachable. */
  connect: () => Promise<void>;
  /** Push an audio chunk (called by useMicCapture's onChunk). */
  sendChunk: (chunk: Blob) => void;
  /** Tear down. */
  close: () => void;
}

export function useCleoSTT(opts: {
  onPartial?: (text: string, confidence: number | null) => void;
  onFinal?: (text: string, confidence: number | null) => void;
  onReady?: () => void;
  onError?: (message: string) => void;
  onClose?: () => void;
}): CleoSTT {
  const [status, setStatus] = useState<SttStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [partial, setPartial] = useState<string>("");

  const wsRef = useRef<WebSocket | null>(null);
  const pendingRef = useRef<ArrayBuffer[]>([]);
  const readyRef = useRef<boolean>(false);
  const optsRef = useRef(opts);
  useEffect(() => { optsRef.current = opts; }, [opts]);

  const connect = useCallback(async (): Promise<void> => {
    if (wsRef.current) return;
    setError(null);
    setPartial("");
    setStatus("connecting");

    const { data: session } = await supabase.auth.getSession();
    const jwt = session.session?.access_token;
    if (!jwt) {
      const m = "Not signed in.";
      setError(m); setStatus("error");
      optsRef.current.onError?.(m);
      return;
    }
    if (!DEFAULT_STT_URL) {
      const m = "STT URL not configured (set VITE_CLEO_STT_URL or VITE_SUPABASE_URL).";
      setError(m); setStatus("error");
      optsRef.current.onError?.(m);
      return;
    }

    let ws: WebSocket;
    try {
      // Two-protocol handshake — the edge fn echoes "cleo-stt"; "bearer.<jwt>"
      // carries auth out-of-band of the un-settable Authorization header.
      ws = new WebSocket(DEFAULT_STT_URL, ["cleo-stt", `bearer.${jwt}`]);
      ws.binaryType = "arraybuffer";
    } catch (e) {
      const m = `WS open threw: ${(e as Error).message}`;
      setError(m); setStatus("error");
      optsRef.current.onError?.(m);
      return;
    }
    wsRef.current = ws;

    ws.onmessage = (e: MessageEvent) => {
      if (typeof e.data !== "string") return; // edge fn only sends text
      let parsed: SttMessage;
      try { parsed = JSON.parse(e.data) as SttMessage; } catch { return; }
      if (parsed.type === "ready") {
        readyRef.current = true;
        setStatus("ready");
        // Drain any chunks queued while the WS was opening.
        for (const buf of pendingRef.current) {
          try { ws.send(buf); } catch { /* swallow */ }
        }
        pendingRef.current = [];
        optsRef.current.onReady?.();
        return;
      }
      if (parsed.type === "partial") {
        setPartial(parsed.text);
        optsRef.current.onPartial?.(parsed.text, parsed.confidence ?? null);
        return;
      }
      if (parsed.type === "final") {
        setPartial("");
        optsRef.current.onFinal?.(parsed.text, parsed.confidence ?? null);
        return;
      }
      if (parsed.type === "error") {
        setError(parsed.message);
        setStatus("error");
        optsRef.current.onError?.(parsed.message);
        return;
      }
      if (parsed.type === "upstream-closed") {
        // Deepgram closed — we'll get our own close event next.
      }
    };

    ws.onerror = (ev: Event | ErrorEvent) => {
      const m = (ev as ErrorEvent).message ?? "WS error";
      setError(m);
      setStatus("error");
      optsRef.current.onError?.(m);
    };

    ws.onclose = (ev: CloseEvent) => {
      readyRef.current = false;
      wsRef.current = null;
      pendingRef.current = [];
      setStatus("closed");
      optsRef.current.onClose?.();
      if (ev.code !== 1000 && ev.code !== 1001) {
        // abnormal close
        setError((prev) => prev ?? `WS closed: ${ev.code} ${ev.reason}`);
      }
    };
  }, []);

  const sendChunk = useCallback((chunk: Blob): void => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      // queue until WS open + ready
      void chunk.arrayBuffer().then((buf) => {
        if (pendingRef.current.length < 80) pendingRef.current.push(buf);
      });
      return;
    }
    if (!readyRef.current) {
      void chunk.arrayBuffer().then((buf) => {
        if (pendingRef.current.length < 80) pendingRef.current.push(buf);
      });
      return;
    }
    void chunk.arrayBuffer().then((buf) => {
      try { ws.send(buf); } catch { /* swallow */ }
    });
  }, []);

  const close = useCallback((): void => {
    const ws = wsRef.current;
    if (ws) {
      try { ws.send(JSON.stringify({ type: "end" })); } catch { /* swallow */ }
      try { ws.close(1000, "client-close"); } catch { /* swallow */ }
    }
    wsRef.current = null;
    readyRef.current = false;
    pendingRef.current = [];
    setStatus("closed");
  }, []);

  // Unmount safety.
  useEffect(() => close, [close]);

  return { status, error, partial, connect, sendChunk, close };
}

type SttMessage =
  | { type: "ready" }
  | { type: "partial"; text: string; confidence?: number | null }
  | { type: "final"; text: string; confidence?: number | null }
  | { type: "error"; message: string }
  | { type: "upstream-closed"; code: number; reason: string };
