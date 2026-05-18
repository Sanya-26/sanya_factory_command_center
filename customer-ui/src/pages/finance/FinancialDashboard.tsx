import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { MetricCard } from "@/components/ui/MetricCard";
import { KPICounter } from "@/components/ui/KPICounter";
import { ResponsiveCardGrid } from "@/components/ui/ResponsiveCardGrid";
import { AnimatedSection } from "@/components/ui/AnimatedSection";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

export default function FinancialDashboard() {
  const [metrics, setMetrics] = useState<any>(null);
  const [isForecasting, setIsForecasting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchDailySnapshot();
  }, []);

  const fetchDailySnapshot = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setMetrics({
        cash_on_hand: 128000,
        monthly_revenue: 42000,
        gross_margin_pct: 62,
        forecast_60d: 182000,
      });
      return;
    }
    const res = await supabase.functions.invoke('frontend-router', {
      body: { path: '/api/v1/finance/dashboard/daily-snapshot' }
    });
    if (res.data) setMetrics(res.data);
  };

  const handleGenerateForecast = async () => {
    setIsForecasting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setMetrics((current: any) => ({ ...(current ?? {}), forecast_60d: 188000 }));
        toast({ title: "Preview forecast generated", description: "Connect a client session to run the live forecast function." });
        return;
      }
      await supabase.functions.invoke('frontend-router', {
        body: { path: '/api/v1/finance/cash-forecast/generate' }
      });
      toast({ title: "Forecast Generated", description: "60-day cash forecast rebuilt." });
      fetchDailySnapshot(); // Refresh data
    } catch (e) {
      toast({ title: "Forecast Failed", variant: "destructive" });
    } finally {
      setIsForecasting(false);
    }
  };

  return (
    <DashboardLayout>
      <DashboardHeader 
        title="Financial Cockpit"
        subtitle="Real-time revenue, margin, and liquidity pulse."
        actions={<Button onClick={handleGenerateForecast} disabled={isForecasting}>Regenerate 60d Forecast</Button>}
      />
      <AnimatedSection className="mt-8">
        <ResponsiveCardGrid>
          <MetricCard 
            label="Cash on Hand"
            value={<KPICounter to={metrics?.cash_on_hand || 0} prefix="$" />}
            trend="Stable"
          />
          <MetricCard 
            label="Monthly Revenue"
            value={<KPICounter to={metrics?.monthly_revenue || 0} prefix="$" />}
            trend="+5.2%"
            intent="positive"
          />
          <MetricCard 
            label="Gross Margin"
            value={<KPICounter to={metrics?.gross_margin_pct || 0} suffix="%" />}
            trend="-0.4%"
          />
          <MetricCard 
            label="60-Day Cash Forecast"
            value={<KPICounter to={metrics?.forecast_60d || 0} prefix="$" />}
            trend="Projected"
          />
        </ResponsiveCardGrid>
      </AnimatedSection>
    </DashboardLayout>
  );
}
