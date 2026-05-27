import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listPlans, purchasePlan } from "@/lib/credits.functions";
import { Check, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function UpgradeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const fetchPlans = useServerFn(listPlans);
  const buy = useServerFn(purchasePlan);
  const qc = useQueryClient();

  const { data: plans = [] } = useQuery({
    queryKey: ["plans"],
    queryFn: () => fetchPlans(),
    enabled: open,
  });

  const purchaseMut = useMutation({
    mutationFn: (planId: string) => buy({ data: { planId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["credits"] });
      toast.success("Plan activado. Créditos disponibles.");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Error al procesar"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="text-2xl">Elige tu plan</DialogTitle>
          <DialogDescription>
            Cada análisis de un nuevo contrato consume 1 crédito. Las consultas dentro del mismo hilo son gratuitas.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-2">
          {plans.map((p) => {
            const featured = p.id === "corporativo";
            return (
              <div
                key={p.id}
                className={cn(
                  "relative flex flex-col rounded-xl border bg-card p-5 transition-all",
                  featured ? "border-gold/70 shadow-elegant" : "border-border/60",
                )}
              >
                {featured && (
                  <div className="absolute -top-2 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-widest bg-gradient-gold text-primary-foreground rounded-full px-2 py-0.5 shadow-glow">
                    Recomendado
                  </div>
                )}
                <div className="text-sm text-muted-foreground">{p.name}</div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-bold">${Number(p.price_usd).toFixed(0)}</span>
                  <span className="text-xs text-muted-foreground">
                    {p.period === "one_time" ? "/único" : p.period === "month" ? "/mes" : ""}
                  </span>
                </div>
                <div className="mt-3 text-sm">
                  {p.is_unlimited ? (
                    <span className="font-semibold text-gold">Créditos ilimitados</span>
                  ) : (
                    <span className="font-semibold">{p.credits_per_period} créditos</span>
                  )}
                </div>
                <ul className="mt-4 space-y-1.5 text-xs text-muted-foreground flex-1">
                  <li className="flex gap-1.5"><Check className="h-3 w-3 text-gold mt-0.5" /> Auditoría completa de contratos</li>
                  <li className="flex gap-1.5"><Check className="h-3 w-3 text-gold mt-0.5" /> 3 modos de análisis</li>
                  <li className="flex gap-1.5"><Check className="h-3 w-3 text-gold mt-0.5" /> Versión corregida (.docx)</li>
                  {p.id === "pase_unico" && (
                    <li className="flex gap-1.5 text-muted-foreground/70">
                      <Sparkles className="h-3 w-3 mt-0.5" /> Amarrado a 1 documento
                    </li>
                  )}
                </ul>
                <Button
                  size="sm"
                  className={cn(
                    "mt-5",
                    featured ? "bg-gradient-gold text-primary-foreground hover:opacity-95" : "",
                  )}
                  variant={featured ? "default" : "outline"}
                  disabled={purchaseMut.isPending}
                  onClick={() => purchaseMut.mutate(p.id)}
                >
                  {p.is_unlimited ? "Activar Ultra" : "Adquirir"}
                </Button>
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-center text-muted-foreground mt-4">
          Pago seguro vía pasarela certificada. Datos cifrados extremo a extremo.
        </p>
      </DialogContent>
    </Dialog>
  );
}
