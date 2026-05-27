import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listThreads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("threads")
      .select("id, title, chat_type, created_at, updated_at")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { title?: string; chat_type?: "consulta" | "accion" }) =>
    z
      .object({
        title: z.string().min(1).max(200).optional(),
        chat_type: z.enum(["consulta", "accion"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const chatType = data.chat_type ?? "consulta";
    const defaultTitle = chatType === "accion" ? "Nueva acción" : "Nueva consulta";
    const { data: row, error } = await context.supabase
      .from("threads")
      .insert({
        user_id: context.userId,
        title: data.title ?? defaultTitle,
        chat_type: chatType,
      })
      .select("id, title, chat_type, created_at, updated_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const renameThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; title: string }) =>
    z.object({ id: z.string().uuid(), title: z.string().min(1).max(200) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("threads")
      .update({ title: data.title, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("threads").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getThreadMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { threadId: string }) =>
    z.object({ threadId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: thread, error: tErr } = await context.supabase
      .from("threads")
      .select("id, title, chat_type")
      .eq("id", data.threadId)
      .maybeSingle();
    if (tErr) throw new Error(tErr.message);
    if (!thread) return null;

    const { data: rows, error } = await context.supabase
      .from("messages")
      .select("id, role, parts, created_at")
      .eq("thread_id", data.threadId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    return {
      thread,
      messages: (rows ?? []).map((r) => ({
        id: r.id,
        role: r.role as "user" | "assistant" | "system",
        parts: r.parts as any,
      })),
    };
  });
