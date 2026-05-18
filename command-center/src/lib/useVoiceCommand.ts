import { useMemo, useRef, useState } from "react";

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<{
    0: {
      transcript: string;
    };
  }>;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export function useVoiceCommand(onTranscript: (transcript: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported] = useState(() => Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition));
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const controls = useMemo(() => {
    return {
      start() {
        const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
        if (!Recognition) {
          return;
        }

        const recognition = new Recognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = "en-US";
        recognition.onresult = (event) => {
          const transcript = event.results[0]?.[0]?.transcript;
          if (transcript) {
            onTranscript(transcript);
          }
        };
        recognition.onend = () => setIsListening(false);
        recognition.onerror = () => setIsListening(false);
        recognitionRef.current = recognition;
        setIsListening(true);
        recognition.start();
      },
      stop() {
        recognitionRef.current?.stop();
        setIsListening(false);
      }
    };
  }, [onTranscript]);

  return {
    isListening,
    isSupported,
    ...controls
  };
}

