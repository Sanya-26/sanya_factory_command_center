// Shared LLM abstraction used by all four product-view agents.
// Provider selected via env var LLM_PROVIDER ∈ {"anthropic","openai","stub"}.
// Default: "stub" — returns a deterministic placeholder so edge functions run
// end-to-end without external creds. Real providers wire in when ready.

export type LlmMessage = { role: "system" | "user" | "assistant"; content: string };

export interface LlmComplete {
  text: string;
  provider: string;
  cost_usd?: number;
}

const PROVIDER = (Deno.env.get("LLM_PROVIDER") ?? "stub").toLowerCase();

export async function complete(args: {
  system: string;
  user: string;
  max_tokens?: number;
}): Promise<LlmComplete> {
  if (PROVIDER === "anthropic") {
    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) throw new Error("ANTHROPIC_API_KEY missing");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: Deno.env.get("ANTHROPIC_MODEL") ?? "claude-opus-4-7",
        max_tokens: args.max_tokens ?? 2048,
        system: args.system,
        messages: [{ role: "user", content: args.user }],
      }),
    });
    if (!res.ok) throw new Error(`anthropic ${res.status}: ${await res.text()}`);
    const json = await res.json();
    const text = (json.content?.[0]?.text as string) ?? "";
    return { text, provider: "anthropic" };
  }

  if (PROVIDER === "openai") {
    const key = Deno.env.get("OPENAI_API_KEY");
    if (!key) throw new Error("OPENAI_API_KEY missing");
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("OPENAI_MODEL") ?? "gpt-4o",
        messages: [
          { role: "system", content: args.system },
          { role: "user", content: args.user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`openai ${res.status}: ${await res.text()}`);
    const json = await res.json();
    const text = (json.choices?.[0]?.message?.content as string) ?? "";
    return { text, provider: "openai" };
  }

  // Stub: deterministic placeholder.
  return {
    text:
      `# Stub output\n\nProvider not configured (LLM_PROVIDER=stub).\n\n## System\n${args.system}\n\n## User\n${args.user}\n`,
    provider: "stub",
  };
}
