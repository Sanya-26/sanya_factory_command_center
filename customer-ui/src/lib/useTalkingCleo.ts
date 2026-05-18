// useTalkingCleo — Cleo's voice + lipsync engine.
//
// Calls the cleo-tts Supabase Edge Function (proxies ElevenLabs),
// receives MP3 audio, plays it through an HTMLAudioElement, and pipes
// that element through wawa-lipsync so the avatar's mouth animates from
// the REAL audio waveform (not a fake cadence track).
//
// API key never reaches the browser — the user's Supabase JWT is what
// authenticates the cleo-tts call; the edge function holds the
// ELEVENLABS_API_KEY secret server-side.
//
// Voice override: localStorage `cleo:voice` is read on every speak().
// Set it from the dev console to A/B different ElevenLabs voices:
//   localStorage.setItem("cleo:voice", "9BWtsMINqrJLrRacOk9x") // Aria (default)
//   localStorage.setItem("cleo:voice", "EXAVITQu4vr4xnSDxMaL") // Sarah
//   localStorage.setItem("cleo:voice", "cgSgspJ2msm6clMCkdW9") // Jessica
//   localStorage.setItem("cleo:voice", "XB0fDUnXU5powFXDhCwa") // Charlotte
//   localStorage.setItem("cleo:voice", "XrExE9yKIg1WjnnlVkGX") // Matilda

import { useEffect, useRef, useState, useCallback } from "react";
import { Lipsync } from "wawa-lipsync";
import { supabase } from "@/integrations/supabase";

interface UseTalkingCleoReturn {
  /** Pass to <Cleo3D lipsync={lipsync} />. */
  lipsync: Lipsync | null;
  /** True while Cleo is currently speaking. */
  isSpeaking: boolean;
  /** Speak a string. Cancels any in-progress speech. */
  speak: (text: string, opts?: { voice?: string; model?: string }) => Promise<void>;
  /** Stop any in-progress speech immediately. */
  stop: () => void;
  /** Force a fresh user-gesture audio context init (some browsers require it). */
  unlock: () => void;
}

export function useTalkingCleo(): UseTalkingCleoReturn {
  const [lipsync, setLipsync] = useState<Lipsync | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const lipsyncRef = useRef<Lipsync | null>(null);
  const currentObjectUrlRef = useRef<string | null>(null);
  const speakSeqRef = useRef(0); // monotonic — guards stale completions

  // Lazy-init the audio pipeline on first speak() (browser autoplay policies
  // require a user gesture before AudioContext can start).
  const ensureInit = useCallback((): { audio: HTMLAudioElement; ls: Lipsync } => {
    if (audioElRef.current && lipsyncRef.current) {
      return { audio: audioElRef.current, ls: lipsyncRef.current };
    }
    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio.preload = "auto";
    // wawa-lipsync requires the audio element to have a valid src BEFORE
    // connectAudio is called — we set a tiny silent dummy first.
    audio.src =
      "data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjYxLjcuMTAwAAAAAAAAAAAAAAD/+0DAAAAAAAAAAAAAAAAAAAAAAAA=";
    audioElRef.current = audio;

    const ls = new Lipsync({ fftSize: 1024, historySize: 8 });
    ls.connectAudio(audio);
    lipsyncRef.current = ls;
    setLipsync(ls);

    audio.addEventListener("ended", () => {
      setIsSpeaking(false);
      // Free the previous Object URL when playback ends.
      if (currentObjectUrlRef.current) {
        URL.revokeObjectURL(currentObjectUrlRef.current);
        currentObjectUrlRef.current = null;
      }
    });
    audio.addEventListener("error", () => {
      console.warn("[useTalkingCleo] audio error", audio.error);
      setIsSpeaking(false);
    });

    return { audio, ls };
  }, []);

  const stop = useCallback(() => {
    speakSeqRef.current++; // invalidate any in-flight speak()
    const audio = audioElRef.current;
    if (audio) {
      audio.pause();
      try { audio.currentTime = 0; } catch { /* not loaded */ }
    }
    setIsSpeaking(false);
  }, []);

  const speak = useCallback(
    async (text: string, opts?: { voice?: string; model?: string }) => {
      if (!text || !text.trim()) return;
      const seq = ++speakSeqRef.current;
      const { audio } = ensureInit();

      // Cancel anything currently playing.
      audio.pause();
      try { audio.currentTime = 0; } catch { /* */ }

      try {
        // Get the user's current session JWT — required by cleo-tts.
        const { data: sess } = await supabase.auth.getSession();
        const accessToken = sess.session?.access_token;
        if (!accessToken) {
          console.warn("[useTalkingCleo] no session — falling back to browser TTS");
          fallbackSpeak(text);
          return;
        }

        const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cleo-tts`;
        const res = await fetch(fnUrl, {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            text: text.trim(),
            voice: opts?.voice ?? readVoiceOverride() ?? undefined,
            model: opts?.model,
          }),
        });

        // If a newer speak() call started while we were waiting, drop this.
        if (seq !== speakSeqRef.current) return;

        if (!res.ok) {
          const txt = await res.text();
          console.warn("[useTalkingCleo] cleo-tts non-OK:", res.status, txt);
          fallbackSpeak(text);
          return;
        }

        const blob = await res.blob();

        // Free any previous Object URL.
        if (currentObjectUrlRef.current) {
          URL.revokeObjectURL(currentObjectUrlRef.current);
        }
        const url = URL.createObjectURL(blob);
        currentObjectUrlRef.current = url;

        audio.src = url;
        audio.load();
        await audio.play();
        setIsSpeaking(true);
      } catch (e) {
        console.warn("[useTalkingCleo] speak failed:", e);
        fallbackSpeak(text);
      }
    },
    [ensureInit]
  );

  const unlock = useCallback(() => { ensureInit(); }, [ensureInit]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      const audio = audioElRef.current;
      if (audio) audio.pause();
      if (currentObjectUrlRef.current) URL.revokeObjectURL(currentObjectUrlRef.current);
      try {
        if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      } catch { /* */ }
    };
  }, []);

  return { lipsync, isSpeaking, speak, stop, unlock };
}

/** Read a voice ID override set in localStorage (dev A/B testing). */
function readVoiceOverride(): string | null {
  try { return localStorage.getItem("cleo:voice"); } catch { return null; }
}

/** Last-resort fallback: browser TTS if cleo-tts is unreachable. */
function fallbackSpeak(text: string): void {
  try {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.0;
    window.speechSynthesis.speak(u);
  } catch { /* nothing more to do */ }
}
