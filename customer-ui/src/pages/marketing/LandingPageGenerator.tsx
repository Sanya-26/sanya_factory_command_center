import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { AnimatedSection } from "@/components/ui/AnimatedSection";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase";

export default function LandingPageGenerator() {
  const [isGenerating, setIsGenerating] = useState(false);
  const companyId = import.meta.env.VITE_AUBOS_COMPANY_ID;

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const res = await fetch('/api/v1/landing-pages/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: companyId, campaign_intent: "Ad conversion" })
      });
      if (!res.ok) throw new Error("Generation failed");
      toast.success("Landing page generated successfully! FTC disclaimers enforced.");
    } catch (error) {
      toast.error("Failed to generate variant");
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePublish = async (pageId: string) => {
    try {
      await fetch('/api/v1/landing-pages/publish', { method: 'POST', body: JSON.stringify({ id: pageId }) });
      toast.success("Published live");
    } catch (e) {
      toast.error("Publish failed");
    }
  };

  return (
    <DashboardLayout>
      <DashboardHeader 
        title="Ad Landing Pages"
        subtitle="Generate matched landing pages for Drink GIÓ campaigns. Automatically localized with 21+ age gates and FTC disclaimers."
        actions={<Button onClick={async () => await handleGenerate()} disabled={isGenerating}>{isGenerating ? "Generating..." : "Generate New Match"}</Button>}
      />
      <AnimatedSection className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="bg-card border-border">
          <CardHeader><CardTitle>Margarita Campaign Variant</CardTitle></CardHeader>
          <CardContent>
            <img src="/images/lane-a-margarita.jpg" alt="GIÓ Margarita" className="rounded-lg mb-4 object-cover w-full h-48 bg-muted" />
            <p className="text-sm text-muted-foreground mb-2">
              Features coastal salt and bright citrus hooks. FTC disclaimer attached. 21+ age gate enforced.
            </p>
            <Button variant="secondary" className="w-full" onClick={async () => await handlePublish("page-1")}>Publish Variant</Button>
          </CardContent>
        </Card>
      </AnimatedSection>
    </DashboardLayout>
  );
}
