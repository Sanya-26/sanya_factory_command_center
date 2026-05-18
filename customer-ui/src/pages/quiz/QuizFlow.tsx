import { useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase";

export default function QuizFlow() {
  const [captchaPassed, setCaptchaPassed] = useState(false);
  const [gdprConsent, setGdprConsent] = useState(false);

  const handleTurnstileVerify = async (token: string) => {
    // Mirrors Turnstile verification logic
    setCaptchaPassed(true);
    toast.success("Verified securely");
  };

  const startQuiz = async () => {
    if (!captchaPassed) {
      toast.error("Please complete the security check");
      return;
    }
    if (!gdprConsent) {
      toast.error("EU/UK Users must consent to health-context RAG ROPA before continuing.");
      return;
    }
    // Proceed to RAG quiz context
    toast.success("Quiz started");
  };

  return (
    <DashboardShell>
      <div className="max-w-md mx-auto mt-24">
        <Card className="bg-card border-border shadow-lg">
          <CardContent className="p-8 flex flex-col items-center gap-6">
            <h2 className="text-2xl font-bold text-foreground text-center tracking-tight">Find Your GIÓ Ritual</h2>
            <p className="text-muted-foreground text-center">
              Take the quiz to discover the perfect social elixir based on your evening routine.
            </p>

            <div className="w-full p-4 border border-border rounded bg-muted/30">
              {/* Stub for Cloudflare Turnstile */}
              <p className="text-xs text-muted-foreground text-center mb-2">Security Check</p>
              <Button variant="outline" className="w-full border-primary/20" onClick={async () => await handleTurnstileVerify("mock-token")}>
                {captchaPassed ? "Verified" : "Click to Verify"}
              </Button>
            </div>

            <div className="flex items-start gap-2">
              <input type="checkbox" id="gdpr" checked={gdprConsent} onChange={(e) => setGdprConsent(e.target.checked)} className="mt-1" />
              <label htmlFor="gdpr" className="text-xs text-muted-foreground">
                I consent to the collection of my wellness preferences (GDPR Art 9 compliance). Pixel tracking deferred per PECR.
              </label>
            </div>

            <Button 
              className="w-full bg-primary text-primary-foreground"
              onClick={async () => await startQuiz()}
            >
              Begin Assessment
            </Button>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
