import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase";

export function BrandGateProvider({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    async function enforceBrandGate() {
      const companyId = import.meta.env.VITE_AUBOS_COMPANY_ID || "";
      if (!companyId) {
        setIsReady(true);
        return;
      }

      const { data, error } = await supabase
        .from("companies")
        .select("brand_palette, brand_typography")
        .eq("id", companyId)
        .single();

      if (error) {
        console.error("BrandGate read failed", error);
        setIsReady(true);
        return;
      }

      if (!data?.brand_palette) {
        await supabase.from("audit_log").insert({
          action: "brand_palette_missing",
          target_table: "public.companies",
          target_id: companyId,
          company_id: companyId
        });
        document.documentElement.classList.add("theme-neutral");
      }

      if (!data?.brand_typography) {
        await supabase.from("audit_log").insert({
          action: "brand_typography_missing",
          target_table: "public.companies",
          target_id: companyId,
          company_id: companyId
        });
        document.documentElement.classList.add("font-system-ui");
      }

      setIsReady(true);
    }
    enforceBrandGate();
  }, []);

  if (!isReady) return null;
  return <>{children}</>;
}
