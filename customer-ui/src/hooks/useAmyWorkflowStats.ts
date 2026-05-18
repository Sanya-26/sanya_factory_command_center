import { useEffect, useState } from "react";

export interface AmyWorkflowStats {
  contentAnalyzed: number;
  strategyTweaks: number;
  mediaGenerated: number;
  addedToCalendar: number;
  postAnalysesCount: number;
}

const DEFAULT_STATS: AmyWorkflowStats = {
  contentAnalyzed: 37,
  strategyTweaks: 38,
  mediaGenerated: 8,
  addedToCalendar: 0,
  postAnalysesCount: 365,
};

export function useAmyWorkflowStats(brandId?: string) {
  const [stats, setStats] = useState<AmyWorkflowStats>(DEFAULT_STATS);

  useEffect(() => {
    if (!brandId) {
      setStats(DEFAULT_STATS);
      return;
    }
    setStats(DEFAULT_STATS);
  }, [brandId]);

  return { stats, loading: false };
}
