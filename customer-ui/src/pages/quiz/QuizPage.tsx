import { useState } from "react";
import TurnstileWidget from "@/components/security/TurnstileWidget";

export default function QuizPage(): JSX.Element {
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

  const handleQuizStart = () => {
    if (!turnstileToken) return;
    setStarted(true);
  };

  return (
    <main className="gio-quiz-page">
      <section className="gio-quiz-card">
        <p className="gio-quiz-eyebrow">Drink GIÓ</p>
        <h1>Discover Your Botanical Intelligence</h1>
        <p>
          Our concierge will craft the perfect elixir routine based on your wellness goals.
        </p>

        <TurnstileWidget
          verified={Boolean(turnstileToken)}
          onVerify={setTurnstileToken}
          onExpire={() => setTurnstileToken(null)}
        />

        <button
          type="button"
          className="gio-primary-button"
          disabled={!turnstileToken}
          onClick={handleQuizStart}
        >
          Begin Assessment
        </button>

        {started ? (
          <div className="gio-quiz-started" role="status">
            Assessment unlocked. The recommendation flow can now call the verified quiz backend.
          </div>
        ) : null}
      </section>
    </main>
  );
}
