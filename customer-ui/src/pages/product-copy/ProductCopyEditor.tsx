import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AnimatedSection } from "@/components/ui/AnimatedSection";
import { useToast } from "@/components/ui/use-toast";

export default function ProductCopyEditor() {
  const [drafts, setDrafts] = useState<any[]>([]);
  const [isDrafting, setIsDrafting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchDrafts();
  }, []);

  const fetchDrafts = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setDrafts([
        {
          id: "preview-copy-1",
          product_name: "Berry Mule",
          draft_content: "Tart berry vibrancy sparked by real ginger heat. A non-alcoholic social elixir with zero crash.",
          fda_cleared: true,
          status: "draft",
        },
      ]);
      return;
    }
    const { data } = await supabase.from('product_copy_drafts').select('id, product_name, draft_content, fda_cleared, status');
    if (data) setDrafts(data);
  };

  const handleDraftAll = async () => {
    setIsDrafting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({ title: "Preview drafts generated", description: "Connect a client session to run the live product-copy function." });
        return;
      }
      await supabase.functions.invoke('frontend-router', {
        body: { path: '/api/v1/product-copy/draft' }
      });
      toast({ title: "Drafts Generated", description: "Brand voice and FDA checks applied." });
      fetchDrafts();
    } catch (e) {
      toast({ title: "Drafting Failed", variant: "destructive" });
    } finally {
      setIsDrafting(false);
    }
  };

  const handlePublishToShopify = async (id: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setDrafts((current) => current.map((draft) => draft.id === id ? { ...draft, status: "published" } : draft));
        toast({ title: "Preview published", description: "Shopify sync runs after client auth is connected." });
        return;
      }
      await supabase.functions.invoke('frontend-router', {
        body: { path: '/api/v1/product-copy/publish-to-shopify', draftId: id }
      });
      toast({ title: "Published", description: "Synced to Shopify successfully." });
      fetchDrafts();
    } catch (e) {
      toast({ title: "Sync Failed", variant: "destructive" });
    }
  };

  return (
    <DashboardLayout>
      <DashboardHeader 
        title="Product Copy Editor"
        subtitle="AI-assisted PDP copy ensuring 21 CFR 101.93 FDA compliance and brand voice."
        actions={<Button onClick={handleDraftAll} disabled={isDrafting}>Draft Catalog Updates</Button>}
      />
      <AnimatedSection className="mt-8 grid gap-6">
        {drafts.map(draft => (
          <Card key={draft.id}>
            <CardHeader>
              <CardTitle>{draft.product_name}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-muted p-4 rounded-md text-sm mb-4">
                {draft.draft_content}
              </div>
              <div className="flex items-center justify-between">
                <span className={`text-sm font-medium ${draft.fda_cleared ? 'text-primary' : 'text-destructive'}`}>
                  {draft.fda_cleared ? '✓ FDA Compliant (No Disease Claims)' : '⚠ FDA Review Required'}
                </span>
                <Button onClick={() => handlePublishToShopify(draft.id)} disabled={!draft.fda_cleared || draft.status === 'published'}>
                  Publish to Shopify
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {drafts.length === 0 && <p className="text-muted-foreground p-4">No drafts available.</p>}
      </AnimatedSection>
    </DashboardLayout>
  );
}
