import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase";

export interface BrandData {
  id: string;
  name: string;
  product_category?: string;
  BrandLogo?: string | null;
}

const FALLBACK_BRAND: BrandData = {
  id: "preview",
  name: "AUBOS",
  product_category: "workspace",
  BrandLogo: null,
};

export function useBrandData() {
  const [brand, setBrand] = useState<BrandData | null>(FALLBACK_BRAND);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          if (!cancelled) setBrand(FALLBACK_BRAND);
          return;
        }
        const { data } = await supabase
          .from("companies")
          .select("id,name,display_name,product_category,logo_url")
          .eq("user_id", session.user.id)
          .limit(1)
          .maybeSingle();
        if (!cancelled && data) {
          setBrand({
            id: String(data.id),
            name: String(data.display_name || data.name || "AUBOS"),
            product_category: String(data.product_category || "workspace"),
            BrandLogo: data.logo_url ? String(data.logo_url) : null,
          });
        }
      } catch {
        if (!cancelled) setBrand(FALLBACK_BRAND);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { brand, loading };
}
