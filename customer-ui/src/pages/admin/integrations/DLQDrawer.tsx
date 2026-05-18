import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase";

export default function DLQDrawer() {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const companyId = import.meta.env.VITE_AUBOS_COMPANY_ID;

  const handleReplay = async (queueType: string, eventId: string) => {
    setLoadingId(eventId);
    try {
      const endpoint = `/admin/integrations/${queueType}/dlq/replay`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Company-Key": companyId || "" },
        body: JSON.stringify({ id: eventId })
      });
      if (!res.ok) throw new Error("Replay failed");
      toast.success(`Event ${eventId} replayed on ${queueType} primary queue`);
      await supabase.from('audit_log').insert({ company_id: companyId, action: 'dlq_replay', target_id: eventId });
    } catch (err) {
      toast.error("Replay failed. Max 3 manual replays allowed.");
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <DashboardLayout>
      <DashboardHeader 
        title="Dead Letter Queues"
        subtitle="Monitor and replay failed webhook events across connected integrations."
      />
      <div className="grid gap-6 md:grid-cols-2 mt-6">
        <AnimatePresence>
          {["shopify", "tiktok-shop", "meta", "tiktok-ads"].map((queue) => (
            <motion.div key={queue} initial={{ opacity: 0 }} animate={{ opacity: 1 }} layout>
              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="capitalize text-card-foreground">{queue.replace('-', ' ')} DLQ</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-between">
                  <p className="text-muted-foreground text-sm">Review failed payload deliveries.</p>
                  <Button 
                    variant="outline"
                    disabled={loadingId === queue}
                    onClick={async () => await handleReplay(queue, "latest-event-id")}
                    className="border-primary text-primary hover:bg-primary/10"
                  >
                    {loadingId === queue ? "Replaying..." : "Replay Latest"}
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </DashboardLayout>
  );
}
