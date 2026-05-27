import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type CreditState = {
  plan_id: string | null;
  plan_name: string | null;
  credits_remaining: number;
  is_unlimited: boolean;
  period_ends_at: string | null;
};

export const getMyCredits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CreditState> => {
    const { data } = await supabaseAdmin
      .from("user_credits")
      .select("plan_id, credits_remaining, is_unlimited, period_ends_at, plans(name)")
      .eq("user_id", context.userId)
      .maybeSingle();

    if (!data) {
      await supabaseAdmin.from("user_credits").insert({
        user_id: context.userId,
        plan_id: null,
        credits_remaining: 0,
        is_unlimited: false,
      });
      return { plan_id: null, plan_name: null, credits_remaining: 0, is_unlimited: false, period_ends_at: null };
    }

    return {
      plan_id: data.plan_id,
      plan_name: (data as any).plans?.name ?? null,
      credits_remaining: data.credits_remaining,
      is_unlimited: data.is_unlimited,
      period_ends_at: data.period_ends_at,
    };
  });

export const listPlans = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("plans")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
});

/**
 * Stub de compra. En producción debe sustituirse por integración con Stripe/Paddle.
 * De momento asigna los créditos del plan elegido para permitir QA end-to-end.
 */
export const purchasePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { planId: string }) => z.object({ planId: z.string().min(1).max(50) }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: plan, error } = await supabaseAdmin
      .from("plans")
      .select("*")
      .eq("id", data.planId)
      .maybeSingle();
    if (error || !plan) throw new Error("Plan no encontrado");

    const credits = plan.is_unlimited ? 0 : plan.credits_per_period ?? 0;
    const periodEnds =
      plan.period === "month" ? new Date(Date.now() + 30 * 86400 * 1000).toISOString() : null;

    const { data: current } = await supabaseAdmin
      .from("user_credits")
      .select("credits_remaining")
      .eq("user_id", context.userId)
      .maybeSingle();

    const newCredits = plan.is_unlimited ? 0 : (current?.credits_remaining ?? 0) + credits;

    await supabaseAdmin
      .from("user_credits")
      .upsert(
        {
          user_id: context.userId,
          plan_id: plan.id,
          credits_remaining: newCredits,
          is_unlimited: plan.is_unlimited,
          period_ends_at: periodEnds,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

    await supabaseAdmin.from("credit_transactions").insert({
      user_id: context.userId,
      delta: credits,
      reason: `purchase_${plan.id}`,
    });

    return { ok: true, credits_remaining: newCredits, is_unlimited: plan.is_unlimited };
  });
