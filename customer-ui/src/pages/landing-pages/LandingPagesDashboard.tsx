import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { ResponsiveCardGrid } from "@/components/ui/ResponsiveCardGrid";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AnimatedSection } from "@/components/ui/AnimatedSection";
import { useToast } from "@/components/ui/use-toast";

export default function LandingPagesDashboard() {
  const [pages, setPages] = useState<any[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchPages();
  }, []);

  const fetchPages = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setPages([
        { id: "preview-lp-1", title: "Margarita Campaign Variant", status: "draft", created_at: new Date().toISOString() },
      ]);
      return;
    }
    const { data } = await supabase.from('landing_pages').select('id, title, status, created_at');
    if (data) setPages(data);
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setPages((current) => [
          { id: `preview-lp-${current.length + 1}`, title: `Ad landing page ${current.length + 1}`, status: "draft", created_at: new Date().toISOString() },
          ...current,
        ]);
        toast({ title: "Preview generated", description: "Connect a client session to run the live landing-page function." });
        return;
      }
      await supabase.functions.invoke('frontend-router', { 
        body: { path: '/api/v1/landing-pages/generate', context: 'ad-variant-01' } 
      });
      toast({ title: "Generated", description: "Landing page drafted with brand voice & FDA disclaimers." });
      fetchPages();
    } catch (e) {
      toast({ title: "Error", variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePublish = async (id: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setPages((current) => current.map((page) => page.id === id ? { ...page, status: "published" } : page));
        toast({ title: "Preview published", description: "Live publish runs after client auth is connected." });
        return;
      }
      await supabase.functions.invoke('frontend-router', { 
        body: { path: '/api/v1/landing-pages/publish', pageId: id } 
      });
      toast({ title: "Published", description: "Landing page is now live." });
      fetchPages();
    } catch (e) {
      toast({ title: "Publish Failed", variant: "destructive" });
    }
  };

  return (
    <DashboardLayout>
      <DashboardHeader 
        title="Ad Landing Pages"
        subtitle="Autonomous, FTC-compliant, brand-aligned landing pages for every ad creative."
        actions={<Button onClick={handleGenerate} disabled={isGenerating}>Generate Ad LP</Button>}
      />
      <AnimatedSection className="mt-8">
        <ResponsiveCardGrid>
          {pages.map(page => (
            <Card key={page.id}>
              <CardHeader><CardTitle>{page.title}</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">Status: {page.status}</p>
                <Button variant="secondary" onClick={() => handlePublish(page.id)} disabled={page.status === 'published'}>
                  Publish
                </Button>
              </CardContent>
            </Card>
          ))}
          {pages.length === 0 && <p className="text-muted-foreground p-4">No landing pages generated yet.</p>}
        </ResponsiveCardGrid>
      </AnimatedSection>
    </DashboardLayout>
  );
}
