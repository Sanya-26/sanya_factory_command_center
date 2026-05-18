// Signup — invite-gated, single page, three progressive sections.
//
//   1. Account     · email + password
//   2. Verify      · 6-digit OTP from email
//   3. Your business · website + referral code (validates against Factory)
//
// All three sections live on the same scroll. Each unlocks as the previous
// finishes. Hidden by design — only reachable via direct link, never linked
// from /login.

import { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase";
import { decidePostAuthRoute } from "@/lib/postAuthRoute";
import {
  emailSchema,
  passwordSchema,
  checkPasswordBreached,
} from "@/lib/authValidation";

const FACTORY_FN_URL = import.meta.env.VITE_SUPABASE_URL as string;
const FACTORY_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const INPUT_DARK =
  "w-full bg-white/[0.03] border border-white/15 rounded-md px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/40 disabled:opacity-50";
const BTN_PRIMARY =
  "w-full bg-white text-black font-medium rounded-md px-4 py-2.5 text-sm hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors";

type Stage = "email" | "otp" | "details";

export default function Signup(): JSX.Element {
  const navigate = useNavigate();

  const [stage, setStage] = useState<Stage>("email");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [website, setWebsite] = useState("");
  const [referralCode, setReferralCode] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [codeStatus, setCodeStatus] = useState<
    | { state: "idle" }
    | { state: "checking" }
    | { state: "valid"; label: string }
    | { state: "invalid"; reason: string }
  >({ state: "idle" });

  const emailRef = useRef(email);
  emailRef.current = email;

  // Restore email if the user refreshed mid-flow.
  useEffect(() => {
    const saved = sessionStorage.getItem("signup:email");
    if (saved && !email) setEmail(saved);
  }, [email]);

  // Resend cooldown ticker.
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const handleSendCode = async () => {
    if (submitting) return;
    setError(null);
    setInfo(null);

    const e1 = emailSchema.safeParse(email);
    if (!e1.success) {
      setError(e1.error.errors[0].message);
      return;
    }
    const p1 = passwordSchema.safeParse(password);
    if (!p1.success) {
      setError(p1.error.errors[0].message);
      return;
    }

    setSubmitting(true);
    try {
      const breached = await checkPasswordBreached(password);
      if (breached) {
        setError("This password has appeared in known data breaches. Pick something unique.");
        return;
      }

      const { data: signData, error: signErr } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });
      if (signErr) {
        setError(signErr.message);
        return;
      }
      sessionStorage.setItem("signup:email", email.trim());

      // If the project has auto-confirm on, Supabase returns a live session
      // immediately — skip the OTP stage and go straight to the details form.
      if (signData?.session?.access_token) {
        setInfo("Email verified. One last step.");
        setStage("details");
        return;
      }

      setResendCooldown(60);
      setInfo("Code sent. Check your inbox (and spam folder).");
      setStage("otp");
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyCode = async () => {
    if (submitting) return;
    setError(null);
    setInfo(null);

    const clean = otp.replace(/\s/g, "").trim();
    if (!/^\d{6}$/.test(clean)) {
      setError("Code must be 6 digits");
      return;
    }
    const target = (email || sessionStorage.getItem("signup:email") || "").trim();
    if (!target) {
      setError("Missing email — start over");
      setStage("email");
      return;
    }

    setSubmitting(true);
    try {
      const { error: vErr } = await supabase.auth.verifyOtp({
        email: target,
        token: clean,
        type: "signup",
      });
      if (vErr) {
        setError(vErr.message);
        return;
      }
      setInfo("Verified. One last step.");
      setStage("details");
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleResendCode = async () => {
    if (resendCooldown > 0) return;
    setError(null);
    const target = (email || sessionStorage.getItem("signup:email") || "").trim();
    try {
      const { error: rErr } = await supabase.auth.resend({
        type: "signup",
        email: target,
      });
      if (rErr) {
        setError(rErr.message);
        return;
      }
      setResendCooldown(60);
      setInfo(`New code sent to ${target}`);
    } catch (e) {
      setError(String(e));
    }
  };

  const checkCode = async (code: string) => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      setCodeStatus({ state: "idle" });
      return;
    }
    setCodeStatus({ state: "checking" });
    try {
      const res = await fetch(`${FACTORY_FN_URL}/functions/v1/validate-signup-code`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          apikey: FACTORY_ANON,
          authorization: `Bearer ${FACTORY_ANON}`,
        },
        body: JSON.stringify({ code: trimmed, action: "check" }),
      });
      const data = (await res.json()) as
        | { valid: true; customer_label: string }
        | { valid: false; reason: string };
      if (data.valid) {
        setCodeStatus({ state: "valid", label: data.customer_label });
      } else {
        setCodeStatus({ state: "invalid", reason: data.reason });
      }
    } catch (e) {
      setCodeStatus({ state: "invalid", reason: String(e) });
    }
  };

  const handleCompleteSignup = async () => {
    if (submitting) return;
    setError(null);
    setInfo(null);

    const websiteTrim = website.trim();
    if (!/^https?:\/\/.+\..+/.test(websiteTrim)) {
      setError("Website must start with https:// (or http://)");
      return;
    }
    const code = referralCode.trim().toUpperCase();
    if (!code) {
      setError("Referral code required");
      return;
    }

    setSubmitting(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const userId = sess.session?.user?.id;
      if (!userId) {
        setError("Session expired — start over");
        setStage("email");
        return;
      }

      const res = await fetch(`${FACTORY_FN_URL}/functions/v1/validate-signup-code`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          apikey: FACTORY_ANON,
          authorization: `Bearer ${FACTORY_ANON}`,
        },
        body: JSON.stringify({
          code,
          action: "redeem",
          userId,
          website: websiteTrim,
        }),
      });
      const data = (await res.json()) as
        | { ok: true; customer_label: string; invited_by: string; companyId: string | null }
        | { ok: false; reason: string };

      if (!("ok" in data) || !data.ok) {
        setError(("reason" in data && data.reason) || "Couldn't complete signup");
        setReferralCode("");
        setCodeStatus({ state: "idle" });
        return;
      }

      sessionStorage.removeItem("signup:email");
      const dest = await decidePostAuthRoute();
      navigate(dest);
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-black relative overflow-hidden">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-white/[0.04] rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-white/[0.04] rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-10 text-center">
          <h1 className="text-2xl font-light tracking-[0.18em] text-white uppercase">
            AUBOS Factory
          </h1>
          <p className="mt-2 text-sm text-white/50 font-mono">Create your account</p>
        </div>

        <div className="space-y-8">
          <Section index={1} title="Account" done={stage !== "email"}>
            <Field label="Email">
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@yourcompany.com"
                disabled={submitting || stage !== "email"}
                className={INPUT_DARK}
              />
            </Field>
            <Field label="Password">
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={submitting || stage !== "email"}
                className={INPUT_DARK}
              />
              {stage === "email" && (
                <p className="mt-1 text-[0.7rem] text-white/40">
                  8+ chars · upper · lower · number · symbol
                </p>
              )}
            </Field>
            {stage === "email" && (
              <button
                type="button"
                onClick={() => void handleSendCode()}
                disabled={submitting}
                className={BTN_PRIMARY}
              >
                {submitting ? "Sending code…" : "Send code →"}
              </button>
            )}
          </Section>

          {stage !== "email" && (
            <Section index={2} title="Verification" done={stage === "details"}>
              <p className="text-xs text-white/50">
                Code sent to <span className="text-white/80">{email}</span>
              </p>
              <Field label="Verification code">
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  placeholder="123456"
                  disabled={submitting || stage !== "otp"}
                  className={`${INPUT_DARK} text-center text-lg tracking-[0.4em] font-mono`}
                />
              </Field>
              {stage === "otp" && (
                <>
                  <button
                    type="button"
                    onClick={() => void handleVerifyCode()}
                    disabled={submitting || otp.length !== 6}
                    className={BTN_PRIMARY}
                  >
                    {submitting ? "Verifying…" : "Verify →"}
                  </button>
                  <div className="flex items-center justify-between text-[0.7rem]">
                    <button
                      type="button"
                      onClick={() => setStage("email")}
                      className="text-white/40 hover:text-white/60 transition-colors"
                    >
                      ← Different email
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleResendCode()}
                      disabled={resendCooldown > 0}
                      className="text-white/50 hover:text-white/70 disabled:cursor-not-allowed disabled:hover:text-white/50 transition-colors"
                    >
                      {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
                    </button>
                  </div>
                </>
              )}
            </Section>
          )}

          {stage === "details" && (
            <Section index={3} title="Your business" done={false}>
              <Field label="Your website">
                <input
                  type="url"
                  autoComplete="url"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://yourcompany.com"
                  disabled={submitting}
                  className={INPUT_DARK}
                />
              </Field>
              <Field label="Referral code">
                <input
                  type="text"
                  value={referralCode}
                  onChange={(e) => {
                    setReferralCode(e.target.value);
                    setCodeStatus({ state: "idle" });
                  }}
                  onBlur={(e) => void checkCode(e.target.value)}
                  placeholder="AUBOS-..."
                  autoComplete="off"
                  spellCheck={false}
                  disabled={submitting}
                  className={`${INPUT_DARK} font-mono uppercase`}
                />
                <p className="mt-1 text-[0.7rem]">
                  {codeStatus.state === "checking" && (
                    <span className="text-white/50">Checking…</span>
                  )}
                  {codeStatus.state === "valid" && (
                    <span className="text-emerald-400">✓ {codeStatus.label}</span>
                  )}
                  {codeStatus.state === "invalid" && (
                    <span className="text-red-400">✗ {codeStatus.reason}</span>
                  )}
                  {codeStatus.state === "idle" && (
                    <span className="text-white/40">From your AUBOS contact</span>
                  )}
                </p>
              </Field>
              <button
                type="button"
                onClick={() => void handleCompleteSignup()}
                disabled={submitting || !website || !referralCode}
                className={BTN_PRIMARY}
              >
                {submitting ? "Setting up…" : "Complete signup →"}
              </button>
            </Section>
          )}

          {error ? (
            <div className="text-xs text-red-400 bg-red-500/[0.08] border border-red-500/30 rounded-md px-3 py-2">
              {error}
            </div>
          ) : null}
          {info && !error ? (
            <div className="text-xs text-white/60 bg-white/[0.03] border border-white/10 rounded-md px-3 py-2">
              {info}
            </div>
          ) : null}
        </div>

        <p className="mt-8 text-center text-xs text-white/40 font-mono">
          Already have an account?{" "}
          <Link to="/login" className="text-white/70 hover:text-white underline-offset-2 hover:underline">
            Login
          </Link>
        </p>
      </div>
    </div>
  );
}

function Section({
  index,
  title,
  done,
  children,
}: {
  index: number;
  title: string;
  done: boolean;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <section className={`space-y-4 ${done ? "opacity-50" : ""}`}>
      <div className="flex items-center gap-3">
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-full text-[0.65rem] font-mono ${
            done
              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
              : "bg-white/10 text-white/70 border border-white/15"
          }`}
        >
          {done ? "✓" : index}
        </span>
        <h2 className="text-xs font-medium tracking-[0.18em] text-white/70 uppercase">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div>
      <label className="text-xs uppercase tracking-wider text-white/60">{label}</label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
