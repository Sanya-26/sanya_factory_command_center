const MODULE_ALIASES: Record<string, string[]> = {
  main: ["main", "cleo", "overview"],
  bob: ["bob", "finance", "budget"],
  leila: ["leila", "operations", "ops"],
  amy: ["amy", "organic", "social"],
  leo: ["leo", "ads", "paid-ads"],
  jen: ["jen", "email", "marketing-email"],
  dan: ["dan", "seo", "aio"],
  joy: ["joy", "support", "customer-service"],
};

export function useEnabledModules(_companyId?: string | null) {
  function isModuleEnabled(id: string): boolean {
    const enabled = (import.meta.env.VITE_ENABLED_MODULES as string | undefined)
      ?.split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
    if (!enabled || enabled.length === 0) return true;
    const aliases = MODULE_ALIASES[id] ?? [id];
    return aliases.some((alias) => enabled.includes(alias));
  }

  return { isModuleEnabled, loading: false };
}
