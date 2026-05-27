import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { consumeCredit } from "./credits.server";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";

function sanitizeHeader(input: string): string {
  return input
    .replace(/[\u2028\u2029\uFEFF]/g, "")
    .replace(/[\uD800-\uDFFF]/g, "")
    .replace(/[^\x00-\xFF]/g, "")
    .trim();
}

/**
 * Convierte el preview con marcas [[DEL]]...[[/DEL]] y [[ADD]]...[[/ADD]]
 * a versión "limpia" para descarga (sólo se quedan las adiciones, se descartan
 * los textos eliminados).
 */
function cleanFromMarked(marked: string): string {
  return marked
    .replace(/\[\[DEL\]\][\s\S]*?\[\[\/DEL\]\]/g, "")
    .replace(/\[\[ADD\]\]([\s\S]*?)\[\[\/ADD\]\]/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Genera un DOCX simple a partir del markdown limpio. Convierte líneas que
 * empiezan con # a headings.
 */
async function markdownToDocxBase64(markdown: string): Promise<string> {
  const lines = markdown.split(/\r?\n/);
  const paragraphs: Paragraph[] = [];

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      paragraphs.push(new Paragraph({ children: [new TextRun("")] }));
      continue;
    }
    if (line.startsWith("### ")) {
      paragraphs.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(line.slice(4))] }));
    } else if (line.startsWith("## ")) {
      paragraphs.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(line.slice(3))] }));
    } else if (line.startsWith("# ")) {
      paragraphs.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(line.slice(2))] }));
    } else {
      // soporte simple para **negrita**
      const segments = line.split(/(\*\*[^*]+\*\*)/g);
      const runs = segments
        .filter((s) => s.length > 0)
        .map((s) => {
          if (s.startsWith("**") && s.endsWith("**")) {
            return new TextRun({ text: s.slice(2, -2), bold: true });
          }
          return new TextRun(s);
        });
      paragraphs.push(new Paragraph({ children: runs }));
    }
  }

  const doc = new Document({
    styles: {
      default: { document: { run: { font: "Calibri", size: 22 } } },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children: paragraphs,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer).toString("base64");
}

const SYSTEM_REDLINE = `Eres un abogado redactor experto en la legislación de la República de Panamá. Tu tarea es producir una versión CORREGIDA Y OPTIMIZADA de un contrato existente, blindando a la parte indicada.

REGLAS DE SALIDA OBLIGATORIAS:
- Devuelve EXCLUSIVAMENTE el contrato corregido, en español jurídico formal, conforme al Código Civil, Código de Comercio, Código de Trabajo y leyes especiales de Panamá.
- Marca los cambios usando ESTAS etiquetas literales (no markdown nativo):
  - [[DEL]]texto original eliminado[[/DEL]]
  - [[ADD]]texto nuevo añadido[[/ADD]]
- Cuando se reescribe una cláusula completa, envuelve el texto original en [[DEL]]...[[/DEL]] y a continuación el texto nuevo en [[ADD]]...[[/ADD]].
- No agregues comentarios, notas, ni explicaciones fuera del contrato.
- No uses listas con asteriscos ni tablas con barras verticales.
- Usa títulos con # (H1), ## (H2), ### (H3). Negritas con **texto** sólo para títulos de cláusulas o conceptos críticos.
- No inventes citas legales: si no estás seguro de un número de artículo, omítelo.`;

export const generateRedlinePreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { threadId: string }) => z.object({ threadId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    // Tomar todos los mensajes del hilo: el contrato original viene en los attachments
    // y el análisis ya está en las respuestas previas.
    const { data: msgs, error } = await supabaseAdmin
      .from("messages")
      .select("role, parts")
      .eq("thread_id", data.threadId)
      .eq("user_id", context.userId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    if (!msgs?.length) throw new Error("No hay contenido en este hilo.");

    const transcript = msgs
      .map((m) => {
        const text = ((m.parts as any[]) ?? [])
          .filter((p) => p.type === "text")
          .map((p) => p.text)
          .join("\n");
        return `[${m.role.toUpperCase()}]\n${text}`;
      })
      .join("\n\n---\n\n")
      .slice(0, 60000);

    const apiKey = sanitizeHeader(process.env.ANTHROPIC_API_KEY ?? "");
    if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");

    const anthropic = createAnthropic({ apiKey });
    const model = anthropic("claude-sonnet-4-6");

    const { text } = await generateText({
      model,
      system: SYSTEM_REDLINE,
      messages: [
        {
          role: "user",
          content: `A continuación está el historial de la consulta con el contrato analizado y los riesgos identificados.

${transcript}

Genera ahora la VERSIÓN CORREGIDA Y BLINDADA del contrato, con las marcas [[DEL]] y [[ADD]] según las reglas. Devuelve únicamente el contrato.`,
        },
      ],
    });

    const cleanMd = cleanFromMarked(text);

    const { data: row, error: insErr } = await supabaseAdmin
      .from("contract_redlines")
      .insert({
        thread_id: data.threadId,
        user_id: context.userId,
        preview_markdown: text,
        clean_markdown: cleanMd,
        paid: false,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);

    return { redlineId: row.id, preview: text };
  });

export const unlockRedline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { redlineId: string }) =>
    z.object({ redlineId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: redline, error } = await supabaseAdmin
      .from("contract_redlines")
      .select("*")
      .eq("id", data.redlineId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error || !redline) throw new Error("Redline no encontrado");

    if (!redline.paid) {
      try {
        await consumeCredit({
          userId: context.userId,
          reason: "consume_redline",
          threadId: redline.thread_id,
        });
      } catch (e: any) {
        if (e.message === "INSUFFICIENT_CREDITS") {
          return { paid: false, error: "INSUFFICIENT_CREDITS" as const };
        }
        throw e;
      }

      await supabaseAdmin
        .from("contract_redlines")
        .update({ paid: true })
        .eq("id", redline.id);
    }

    const docxBase64 = await markdownToDocxBase64(redline.clean_markdown);

    return {
      paid: true,
      clean_markdown: redline.clean_markdown,
      docx_base64: docxBase64,
      filename: `Contrato_Corregido_Legateck_${redline.id.slice(0, 8)}.docx`,
    };
  });
