// useMicCapture — browser microphone lifecycle (proposal §1.3 / S3).
//
// Wraps navigator.mediaDevices.getUserMedia + MediaRecorder. Yields opus/webm
// audio chunks via the onChunk callback at ~100ms cadence so callers can
// stream them to a WebSocket. The stream is also exposed so future consumers
// (S5: VAD-based interrupt-Cleo, e.g. @ricky0123/vad-web) can tap it.
//
// NOTE: Browser-side VAD is NOT used in S3. Deepgram's server-side endpointing
// (§1.4) gives us 'speech_final' events that mark end-of-utterance, which is
// enough to drive the conversational loop. Interrupt-Cleo (cut off TTS when
// user starts speaking again) lands in S5 alongside the gap-detector.

import { useCallback, useEffect, useRef, useState } from "react";

const CHUNK_MS = 100; // request a chunk every 100ms so latency stays low

export interface MicCapture {
  /** Open the mic + start recording. Resolves once the first chunk has been emitted. */
  start: () => Promise<void>;
  /** Stop recording, close the stream, release the mic. */
  stop: () => void;
  /** Whether the mic is currently open + emitting chunks. */
  isCapturing: boolean;
  /** Last error from getUserMedia / MediaRecorder. Cleared by start(). */
  error: string | null;
  /** Active MediaStream (null when not capturing) — exposed for future VAD wiring. */
  stream: MediaStream | null;
}

export function useMicCapture(opts: {
  onChunk: (chunk: Blob) => void;
  mimeType?: string;
}): MicCapture {
  const { onChunk } = opts;
  const mimeType = opts.mimeType ?? "audio/webm;codecs=opus";

  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onChunkRef = useRef(onChunk);
  useEffect(() => { onChunkRef.current = onChunk; }, [onChunk]);

  const start = useCallback(async (): Promise<void> => {
    if (recorderRef.current) return; // already capturing
    setError(null);
    let s: MediaStream;
    try {
      s = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
          sampleRate: 16000,
        },
        video: false,
      });
    } catch (e) {
      setError(`Mic access denied: ${(e as Error).message}`);
      return;
    }
    streamRef.current = s;
    setStream(s);

    let chosenMime = mimeType;
    if (!MediaRecorder.isTypeSupported(chosenMime)) {
      // Safari/older browsers: fall back to plain webm
      chosenMime = "audio/webm";
      if (!MediaRecorder.isTypeSupported(chosenMime)) {
        chosenMime = ""; // browser default
      }
    }

    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(s, chosenMime ? { mimeType: chosenMime } : undefined);
    } catch (e) {
      s.getTracks().forEach((t) => t.stop());
      setStream(null);
      streamRef.current = null;
      setError(`MediaRecorder init failed: ${(e as Error).message}`);
      return;
    }

    rec.ondataavailable = (ev: BlobEvent) => {
      if (ev.data && ev.data.size > 0) onChunkRef.current(ev.data);
    };
    rec.onerror = (ev: Event) => {
      setError(`MediaRecorder error: ${(ev as ErrorEvent).message ?? "unknown"}`);
    };
    rec.onstop = () => {
      // cleanup happens in stop()
    };

    rec.start(CHUNK_MS);
    recorderRef.current = rec;
    setIsCapturing(true);
  }, [mimeType]);

  const stop = useCallback((): void => {
    const rec = recorderRef.current;
    if (rec) {
      try { rec.stop(); } catch { /* swallow */ }
      recorderRef.current = null;
    }
    const s = streamRef.current;
    if (s) {
      s.getTracks().forEach((t) => { try { t.stop(); } catch { /* swallow */ } });
      streamRef.current = null;
    }
    setStream(null);
    setIsCapturing(false);
  }, []);

  // Unmount safety — close mic even if caller forgot to stop.
  useEffect(() => stop, [stop]);

  return { start, stop, isCapturing, error, stream };
}
