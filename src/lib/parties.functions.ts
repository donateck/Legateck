import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
// @ts-ignore
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";

function sanitizeHeader(input: string): string {
  return input
    .replace(/[\u2028\u2029\uFEFF]/g, "")
    .replace(/[\uD800-\uDFFF]/g, "")
    .replace(/[^\x00-\xFF]/g, "")
    .trim();
}

async function downloadBytes(path: string): Promise<Uint8Array> {
  const { data, error } = await supabaseAdmin.storage.from("legal-docs").download(path);
  if (error || !data) throw new Error(`No se pudo leer el archivo`);
  return new Uint8Array(await data.arrayBuffer());
}

async function extractAny(path: string): Promise<string> {
  const bytes = await downloadBytes(path);
  const lower = path.toLowerCase();
  if (lower.endsWith(".pdf")) {
    try {
      const pdf = await getDocumentProxy(bytes);
      const { text } = await extractText(pdf, { mergePages: true });
      return Array.isArray(text) ? text.join("\n\n") : text;
    } catch {
      return "";
    }
  }
  if (lower.endsWith(".docx") || lower.endsWith(".doc")) {
    try {
      const res = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
      return res.value as string;
    } catch {
      return "";
    }
  }
  if (lower.endsWith(".txt")) {
    return new TextDecoder("utf-8").decode(bytes);
  }
  return "";
}

export const detectContractParties = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { storagePaths: string[] }) =>
    z.object({ storagePaths: z.array(z.string().min(1).max(500)).min(1).max(5) }).parse(i),
  )
  .handler(async ({ data }) => {
    let combined = "";
    for (const p of data.storagePaths) {
      const t = await extractAny(p);
      if (t) combined += "\n\n" + t;
      if (combined.length > 20000) break;
    }
    combined = combined.slice(0, 20000).trim();

    if (combined.length < 80) {
      return { partyA: null, partyB: null, reason: "no_text" as const };
    }

    const apiKey = sanitizeHeader(process.env.ANTHROPIC_API_KEY ?? "");
    if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");

    const anthropic = createAnthropic({ apiKey });
    const model = anthropic("claude-sonnet-4-6");

    const { text } = await generateText({
      model,
      system: `Eres un extractor jurídico. Lee el contrato y devuelve EXCLUSIVAMENTE un JSON válido con esta forma exacta:
{"partyA":"<nombre o rol de la primera parte>","partyB":"<nombre o rol de la segunda parte>"}
- Usa el nombre propio si aparece (persona natural o jurídica). Si sólo hay roles (ej: "EL ARRENDADOR"), úsalos.
- Máximo 60 caracteres cada uno. Sin comillas internas.
- Si no logras identificar ambas partes, devuelve {"partyA":null,"partyB":null}.
- No agregues ningún texto adicional, ni explicación, ni markdown. Solo el JSON.`,
      messages: [
        { role: "user", content: `Contrato:\n\n${combined}` },
      ],
    });

    try {
      const match = text.match(/\{[\s\S]*\}/);
      const json = JSON.parse(match ? match[0] : text);
      const clean = (v: any) =>
        typeof v === "string" && v.trim().length > 0 ? v.trim().slice(0, 60) : null;
      return { partyA: clean(json.partyA), partyB: clean(json.partyB), reason: null };
    } catch {
      return { partyA: null, partyB: null, reason: "parse_error" as const };
    }
  });
