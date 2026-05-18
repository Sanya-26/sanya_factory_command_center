import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AnimatedSection } from "@/components/ui/AnimatedSection";
import { useToast } from "@/components/ui/use-toast";
import { Switch } from "@/components/ui/switch";

export default function AdminIntegrationsDashboard() {
  const { toast } = useToast();
  const [isReplaying, setIsReplaying] = useState(false);
  const [dlqCounts, setDlqCounts] = useState({ shopify: 0, tiktokShop: 0, metaAds: 0, tiktokAds: 0 });
  const [klaviyoMirror, setKlaviyoMirror] = useState(false);

  useEffect(() => {
    fetchDlqStats();
    fetchKlaviyoStatus();
  }, []);

  const fetchDlqStats = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setDlqCounts({ shopify: 0, tiktokShop: 0, metaAds: 0, tiktokAds: 0 });
      return;
    }
    const res = await supabase.functions.invoke('frontend-router', { body: { path: '/admin/integrations/shopify/dlq' }});
    if (res.data) setDlqCounts(prev => ({ ...prev, shopify: res.data.count }));
    // Assume similar fetch calls for other endpoints implemented
  };

  const fetchKlaviyoStatus = async () => {
    const companyId = import.meta.env.VITE_AUBOS_COMPANY_ID;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !companyId) {
      setKlaviyoMirror(false);
      return;
    }
    const { data } = await supabase.from('companies').select('send_provider').eq('id', companyId).single();
    setKlaviyoMirror(data?.send_provider === 'klaviyo');
  };

  const handleReplayShopify = async () => {
    setIsReplaying(true);
    try {
      await supabase.functions.invoke('frontend-router', { body: { path: '/admin/integrations/shopify/dlq/replay' } });
      toast({ title: "Replay Initiated", description: "Shopify DLQ replay queued successfully." });
      fetchDlqStats();
    } catch (e) {
      toast({ title: "Replay Failed", variant: "destructive" });
    } finally {
      setIsReplaying(false);
    }
  };

  const toggleKlaviyoCutover = async () => {
    const newVal = !klaviyoMirror;
    setKlaviyoMirror(newVal);
    const provider = newVal ? 'klaviyo' : 'aubos_mail';
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      toast({ title: "Preview cutover updated", description: `Send provider preview is now ${provider}` });
      return;
    }
    await supabase.functions.invoke('frontend-router', { body: { path: '/admin/integrations/klaviyo/cutover', provider } });
    toast({ title: "Cutover Updated", description: `Send provider is now ${provider}` });
  };

  return (
    <DashboardLayout>
      <DashboardHeader 
        title="Integrations & DLQ Control" 
        subtitle="Manage Dead Letter Queues and provider cutovers."
      />
      <AnimatedSection>
        <Tabs defaultValue="dlq" className="mt-6">
          <TabsList>
            <TabsTrigger value="dlq">Dead Letter Queues</TabsTrigger>
            <TabsTrigger value="cutover">Klaviyo Cutover</TabsTrigger>
          </TabsList>
          
          <TabsContent value="dlq">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
              <Card>
                <CardHeader><CardTitle>Shopify DLQ</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-muted-foreground mb-4">Events stranded: {dlqCounts.shopify}</p>
                  <Button onClick={handleReplayShopify} disabled={isReplaying || dlqCounts.shopify === 0}>
                    Replay Shopify DLQ
                  </Button>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>TikTok Shop DLQ</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-muted-foreground mb-4">Events stranded: {dlqCounts.tiktokShop}</p>
                  <Button onClick={() => {}} disabled variant="secondary">View Queue</Button>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Meta Ads DLQ</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-muted-foreground mb-4">Events stranded: {dlqCounts.metaAds}</p>
                  <Button onClick={() => {}} disabled variant="secondary">View Queue</Button>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>TikTok Ads DLQ</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-muted-foreground mb-4">Events stranded: {dlqCounts.tiktokAds}</p>
                  <Button onClick={() => {}} disabled variant="secondary">View Queue</Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="cutover">
            <Card className="mt-6">
              <CardHeader><CardTitle>Klaviyo Mirror Mode Cutover</CardTitle></CardHeader>
              <CardContent className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Route Sends via Klaviyo</p>
                  <p className="text-sm text-muted-foreground">When disabled, falls back to aubos_mail.</p>
                </div>
                <Switch checked={klaviyoMirror} onCheckedChange={toggleKlaviyoCutover} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </AnimatedSection>
    </DashboardLayout>
  );
}
