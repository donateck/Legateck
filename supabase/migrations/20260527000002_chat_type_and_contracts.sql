-- ─────────────────────────────────────────────────────────────────────────────
-- Legateck · Misión 1: chat_type en threads
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.threads
  ADD COLUMN IF NOT EXISTS chat_type text NOT NULL DEFAULT 'consulta'
  CHECK (chat_type IN ('consulta', 'accion'));

-- ─────────────────────────────────────────────────────────────────────────────
-- Legateck · Misión 2: Tabla de contratos archivados
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.contracts (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_name     text        NOT NULL,
  contract_theme  text        NOT NULL,
  contract_text   text,         -- texto final del contrato generado por IA (NULL si es adjunto firmado)
  file_path       text,         -- ruta en Supabase Storage para contratos firmados externos
  status          text        NOT NULL DEFAULT 'archived'
                              CHECK (status IN ('archived', 'signed_and_archived')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- RLS: cada usuario solo ve y opera sus propios contratos
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all_contracts"
  ON public.contracts
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Índices para búsquedas y ordenamiento por fecha descendente
CREATE INDEX IF NOT EXISTS contracts_user_id_idx       ON public.contracts (user_id);
CREATE INDEX IF NOT EXISTS contracts_user_created_idx  ON public.contracts (user_id, created_at DESC);
