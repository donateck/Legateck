import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyCredits } from "@/lib/credits.functions";
import { Coins, Infinity as InfinityIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CreditsBadge({ onUpgrade }: { onUpgrade: () => void }) {
  const fetchCredits = useServerFn(getMyCredits);
  const { data } = useQuery({
    queryKey: ["credits"],
    queryFn: () => fetchCredits(),
    refetchOnWindowFocus: false,
  });

  const remaining = data?.credits_remaining ?? 0;
  const unlimited = data?.is_unlimited ?? false;
  const empty = !unlimited && remaining <= 0;

  return (
    <button
      onClick={onUpgrade}
      className={cn(
        "w-full flex items-center gap-2 rounded-md border px-3 py-2 text-left text-xs transition-colors",
        empty
          ? "border-destructive/50 bg-destructive/10 text-destructive hover:bg-destructive/15"
          : "border-gold/40 bg-gradient-to-br from-card to-card/40 hover:border-gold/70",
      )}
    >
      {unlimited ? (
        <InfinityIcon className="h-3.5 w-3.5 text-gold" />
      ) : (
        <Coins className={cn("h-3.5 w-3.5", empty ? "text-destructive" : "text-gold")} />
      )}
      <div className="flex-1 min-w-0">
        <div className="font-semibold leading-none">
          {unlimited ? "Ilimitado" : `${remaining} créditos`}
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
          {data?.plan_name ?? "Sin plan activo"}
        </div>
      </div>
      <span className="text-[10px] uppercase tracking-widest text-gold font-semibold">
        {empty ? "Comprar" : "Upgrade"}
      </span>
    </button>
  );
}
