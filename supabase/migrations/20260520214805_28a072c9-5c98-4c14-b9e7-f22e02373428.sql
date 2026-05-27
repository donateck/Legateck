
-- Catálogo de planes
CREATE TABLE public.plans (
  id text PRIMARY KEY,
  name text NOT NULL,
  price_usd numeric(10,2) NOT NULL,
  credits_per_period int,
  period text NOT NULL CHECK (period IN ('one_time','month','unlimited')),
  is_unlimited boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0
);
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plans_select_all" ON public.plans FOR SELECT USING (true);

INSERT INTO public.plans (id, name, price_usd, credits_per_period, period, is_unlimited, sort_order) VALUES
  ('pase_unico',  'Pase Único',        5.00,  1,    'one_time',  false, 1),
  ('emprendedor', 'Plan Emprendedor', 19.00, 10,    'month',     false, 2),
  ('corporativo', 'Plan Corporativo', 29.00, 20,    'month',     false, 3),
  ('ultra',       'Plan Ultra',       99.00, NULL,  'unlimited', true,  4);

-- Créditos por usuario
CREATE TABLE public.user_credits (
  user_id uuid PRIMARY KEY,
  plan_id text REFERENCES public.plans(id),
  credits_remaining int NOT NULL DEFAULT 0,
  is_unlimited boolean NOT NULL DEFAULT false,
  period_ends_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_credits_select_own" ON public.user_credits FOR SELECT USING (auth.uid() = user_id);

-- Transacciones de créditos
CREATE TABLE public.credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  delta int NOT NULL,
  reason text NOT NULL,
  thread_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "credit_tx_select_own" ON public.credit_transactions FOR SELECT USING (auth.uid() = user_id);
CREATE INDEX idx_credit_tx_user ON public.credit_transactions(user_id, created_at DESC);

-- Columnas nuevas en threads
ALTER TABLE public.threads
  ADD COLUMN locked_document_id text,
  ADD COLUMN locked_topic text,
  ADD COLUMN plan_at_creation text;

-- Tabla redlines
CREATE TABLE public.contract_redlines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL,
  user_id uuid NOT NULL,
  preview_markdown text NOT NULL,
  clean_markdown text NOT NULL,
  paid boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.contract_redlines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "redlines_select_own" ON public.contract_redlines FOR SELECT USING (auth.uid() = user_id);
CREATE INDEX idx_redlines_thread ON public.contract_redlines(thread_id);

-- Crear fila user_credits al crear profile (extender trigger existente)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)));

  INSERT INTO public.user_credits (user_id, plan_id, credits_remaining, is_unlimited)
  VALUES (NEW.id, NULL, 0, false)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- Backfill: dar fila de créditos a usuarios existentes (5 créditos de cortesía para QA)
INSERT INTO public.user_credits (user_id, plan_id, credits_remaining, is_unlimited)
SELECT id, NULL, 5, false FROM public.profiles
ON CONFLICT (user_id) DO NOTHING;
