import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { motion } from "framer-motion";

export function BrandGate({ children, companyId }: { children: React.ReactNode, companyId: string }) {
  const [hasPalette, setHasPalette] = useState(true);
  const [hasTypography, setHasTypography] = useState(true);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const enforceBrandSettings = async () => {
      try {
        const { data, error } = await supabase
          .from('companies')
          .select('brand_palette, brand_typography')
          .eq('id', companyId)
          .single();

        if (error || !data) {
          setIsChecking(false);
          return;
        }

        const missingPalette = !data.brand_palette;
        const missingTypography = !data.brand_typography;

        if (missingPalette) {
          setHasPalette(false);
          await supabase.from('audit_log').insert({
            company_id: companyId,
            action: 'brand_palette_missing',
            target_table: 'public.companies',
            target_id: companyId
          });
        }

        if (missingTypography) {
          setHasTypography(false);
          await supabase.from('audit_log').insert({
            company_id: companyId,
            action: 'brand_typography_missing',
            target_table: 'public.companies',
            target_id: companyId
          });
        }
      } finally {
        setIsChecking(false);
      }
    };
    enforceBrandSettings();
  }, [companyId]);

  if (isChecking) return null;

  const isNeutralFallback = !hasPalette || !hasTypography;

  return (
    <div className={isNeutralFallback ? "theme-neutral font-sans system-ui" : ""}>
      {isNeutralFallback && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <Alert variant="destructive" className="bg-destructive/10 text-destructive border-destructive/20">
            <AlertTitle className="font-bold">Brand Configuration Missing</AlertTitle>
            <AlertDescription>
              Brand palette or typography definitions are missing. Rendering neutral system-default.
            </AlertDescription>
          </Alert>
        </motion.div>
      )}
      {children}
    </div>
  );
}
