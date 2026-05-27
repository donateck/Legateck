/**
 * LEGATECK · Funciones de servidor para el archivo de contratos
 *
 * archiveFinalContract  — guarda el texto final aprobado por el usuario
 * uploadSignedContract  — registra un contrato firmado externamente (adjunto)
 * searchContracts       — búsqueda avanzada por nombre, tema y rango de fechas
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ─────────────────────────────────────────────────────────────────────────────
// Tipos públicos
// ─────────────────────────────────────────────────────────────────────────────

export type ContractRow = {
  id: string;
  user_id: string;
  client_name: string;
  contract_theme: string;
  contract_text: string | null;
  file_path: string | null;
  status: "archived" | "signed_and_archived";
  created_at: string;
  updated_at: string;
};

export type ContractFilters = {
  client_name?: string;
  contract_theme?: string;
  date_from?: string;
  date_to?: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. Archivar contrato final generado por IA (aprobado voluntariamente)
// ─────────────────────────────────────────────────────────────────────────────

export const archiveFinalContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { client_name: string; contract_theme: string; contract_text: string }) =>
      z
        .object({
          client_name: z.string().min(1).max(200),
          contract_theme: z.string().min(1).max(200),
          contract_text: z.string().min(1),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("contracts")
      .insert({
        user_id: context.userId,
        client_name: data.client_name,
        contract_theme: data.contract_theme,
        contract_text: data.contract_text,
        status: "archived",
      })
      .select("id, created_at")
      .single();
    if (error) throw new Error(error.message);

    // TODO (producción): descuenta 1 crédito al usuario cuando se desactive TRIAL_MODE
    // await consumeCredit({ userId: context.userId, reason: "archive_contract" });

    return row as { id: string; created_at: string };
  });

// ─────────────────────────────────────────────────────────────────────────────
// 2. Registrar contrato firmado externamente (solo almacenamiento, sin IA)
// ─────────────────────────────────────────────────────────────────────────────

export const uploadSignedContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { client_name: string; contract_theme: string; file_path: string }) =>
      z
        .object({
          client_name: z.string().min(1).max(200),
          contract_theme: z.string().min(1).max(200),
          file_path: z.string().min(1).max(500),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("contracts")
      .insert({
        user_id: context.userId,
        client_name: data.client_name,
        contract_theme: data.contract_theme,
        file_path: data.file_path,
        status: "signed_and_archived",
      })
      .select("id, created_at")
      .single();
    if (error) throw new Error(error.message);
    return row as { id: string; created_at: string };
  });

// ─────────────────────────────────────────────────────────────────────────────
// 3. Búsqueda avanzada con filtros combinados
//    — client_name   : ILIKE (búsqueda parcial)
//    — contract_theme: ILIKE (búsqueda parcial)
//    — date_from     : creado desde (inclusive)
//    — date_to       : creado hasta (inclusive al final del día)
//    Siempre ordenado: más reciente primero
// ─────────────────────────────────────────────────────────────────────────────

export const searchContracts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: ContractFilters) =>
      z
        .object({
          client_name: z.string().max(200).optional(),
          contract_theme: z.string().max(200).optional(),
          date_from: z.string().optional(),
          date_to: z.string().optional(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("contracts")
      .select("id, client_name, contract_theme, status, created_at, file_path")
      .order("created_at", { ascending: false });

    if (data.client_name?.trim()) {
      query = query.ilike("client_name", `%${data.client_name.trim()}%`);
    }
    if (data.contract_theme?.trim()) {
      query = query.ilike("contract_theme", `%${data.contract_theme.trim()}%`);
    }
    if (data.date_from) {
      query = query.gte("created_at", data.date_from);
    }
    if (data.date_to) {
      // Hacer date_to inclusivo: añadir 1 día y usar < para capturar todo el día final
      const end = new Date(data.date_to);
      end.setDate(end.getDate() + 1);
      query = query.lt("created_at", end.toISOString());
    }

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return (rows ?? []) as ContractRow[];
  });
