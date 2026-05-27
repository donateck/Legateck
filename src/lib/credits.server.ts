import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Consume 1 crédito del usuario para la razón indicada. Lanza error si no hay saldo
 * y el usuario no es ilimitado. Devuelve el saldo resultante.
 */
export async function consumeCredit(opts: {
  userId: string;
  reason: string;
  threadId?: string | null;
}): Promise<{ remaining: number; is_unlimited: boolean }> {
  const { data: row } = await supabaseAdmin
    .from("user_credits")
    .select("credits_remaining, is_unlimited")
    .eq("user_id", opts.userId)
    .maybeSingle();

  if (!row) {
    throw new Error("INSUFFICIENT_CREDITS");
  }

  if (row.is_unlimited) {
    await supabaseAdmin.from("credit_transactions").insert({
      user_id: opts.userId,
      delta: 0,
      reason: opts.reason,
      thread_id: opts.threadId ?? null,
    });
    return { remaining: row.credits_remaining, is_unlimited: true };
  }

  if ((row.credits_remaining ?? 0) <= 0) {
    throw new Error("INSUFFICIENT_CREDITS");
  }

  const newRemaining = row.credits_remaining - 1;
  await supabaseAdmin
    .from("user_credits")
    .update({ credits_remaining: newRemaining, updated_at: new Date().toISOString() })
    .eq("user_id", opts.userId);

  await supabaseAdmin.from("credit_transactions").insert({
    user_id: opts.userId,
    delta: -1,
    reason: opts.reason,
    thread_id: opts.threadId ?? null,
  });

  return { remaining: newRemaining, is_unlimited: false };
}

export async function getUserPlan(userId: string): Promise<{
  plan_id: string | null;
  credits_remaining: number;
  is_unlimited: boolean;
}> {
  const { data } = await supabaseAdmin
    .from("user_credits")
    .select("plan_id, credits_remaining, is_unlimited")
    .eq("user_id", userId)
    .maybeSingle();
  return {
    plan_id: data?.plan_id ?? null,
    credits_remaining: data?.credits_remaining ?? 0,
    is_unlimited: data?.is_unlimited ?? false,
  };
}
