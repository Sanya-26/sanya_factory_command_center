import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase";

export default function KlaviyoCutover() {
  const [isKlaviyo, setIsKlaviyo] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const companyId = import.meta.env.VITE_AUBOS_COMPANY_ID;

  useEffect(() => {
    const fetchProvider = async () => {
      const { data } = await supabase.from('companies').select('send_provider').eq('id', companyId).single();
      if (data) setIsKlaviyo(data.send_provider === 'klaviyo');
      setIsLoading(false);
    };
    fetchProvider();
  }, [companyId]);

  const toggleProvider = async () => {
    const newProvider = isKlaviyo ? 'aubos_mail' : 'klaviyo';
    setIsLoading(true);
    const { error } = await supabase.from('companies').update({ send_provider: newProvider }).eq('id', companyId);
    
    if (error) {
      toast.error("Failed to update send provider");
    } else {
      setIsKlaviyo(!isKlaviyo);
      toast.success(`Active mail provider updated to ${newProvider}`);
      await supabase.from('audit_log').insert({ 
        company_id: companyId, 
        action: 'klaviyo_mirror_cutover_toggle', 
        target_table: 'public.companies' 
      });
    }
    setIsLoading(false);
  };

  return (
    <DashboardLayout>
      <DashboardHeader title="Email Infrastructure Cutover" subtitle="Manage staged migration between aubos_mail and Klaviyo mirror mode." />
      <Card className="mt-6 bg-card border-border max-w-xl">
        <CardHeader>
          <CardTitle className="text-card-foreground">Active Sending Provider</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <div>
            <p className="font-medium text-foreground">
              {isKlaviyo ? "Klaviyo Mirror Mode" : "aubos_mail Native"}
            </p>
            <p className="text-sm text-muted-foreground">
              {isKlaviyo ? "Outbound emails routed through Klaviyo API." : "Routing through aubos_mail canonical substrate."}
            </p>
          </div>
          <Switch 
            checked={isKlaviyo} 
            onCheckedChange={async () => await toggleProvider()} 
            disabled={isLoading}
          />
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
