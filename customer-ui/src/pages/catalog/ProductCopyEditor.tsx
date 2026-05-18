import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase";

export default function ProductCopyEditor() {
  const [draft, setDraft] = useState("Tart berry vibrancy sparked by real ginger heat. A non-alcoholic social elixir with zero crash.");
  const [isSaving, setIsSaving] = useState(false);
  const companyId = import.meta.env.VITE_AUBOS_COMPANY_ID;

  const handleDraftSave = async () => {
    setIsSaving(true);
    try {
      await fetch('/api/v1/product-copy/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: "berry-mule", content: draft })
      });
      toast.success("Draft saved and processed through FDA post-filter.");
    } catch (e) {
      toast.error("Draft save failed");
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublish = async () => {
    try {
      await fetch('/api/v1/product-copy/publish-to-shopify', { method: 'POST', body: JSON.stringify({ product_id: "berry-mule" }) });
      toast.success("Published to Shopify successfully");
    } catch (e) {
      toast.error("Failed to publish");
    }
  };

  return (
    <DashboardLayout>
      <DashboardHeader title="Inline PDP Copy Editor" subtitle="Update product descriptions directly. Validated against FDA compliance constraints." />
      <Card className="mt-6 bg-card border-border max-w-3xl">
        <CardContent className="p-6 space-y-4">
          <h3 className="text-lg font-bold text-foreground">Berry Mule</h3>
          <textarea 
            className="w-full min-h-[150px] p-4 bg-background border border-border rounded-md text-foreground focus:ring-1 focus:ring-primary"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="flex items-center gap-3">
            <Button onClick={async () => await handleDraftSave()} disabled={isSaving} className="bg-primary text-primary-foreground">
              {isSaving ? "Checking Compliance..." : "Save Draft"}
            </Button>
            <Button onClick={async () => await handlePublish()} variant="outline" className="border-primary text-primary hover:bg-primary/10">
              Sync to Shopify
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Runs `compliance-officer` FDA 21 CFR 101.93 checks & no-disease classification before save.
          </p>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
