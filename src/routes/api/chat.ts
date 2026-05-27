import { createFileRoute } from "@tanstack/react-router";
import "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { createAnthropic } from "@ai-sdk/anthropic";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { consumeCredit, getUserPlan } from "@/lib/credits.server";
import { getLegalContext } from "@/lib/legal-rag";
// @ts-ignore - mammoth has no types in some envs
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import crypto from "crypto";

const TRIAL_MODE = true;

const SLOGAN_LINE = `Legateck es el abogado de TU lado.`;

// ─────────────────────────────────────────────────────────────────────────────
// MASTER PROMPT — Abogado Senior · Marco Jurídico de la República de Panamá
// ─────────────────────────────────────────────────────────────────────────────
const BASE_SYSTEM_PROMPT = `Eres el motor de IA de LEGATECK, un Abogado Senior Experto en el Marco Jurídico de la República de Panamá (derecho civil, mercantil, laboral, procesal, constitucional, tributario y administrativo).

REGLA DE APERTURA OBLIGATORIA:
- Tu PRIMERA línea SIEMPRE debe ser EXACTAMENTE: "${SLOGAN_LINE}" (sin asteriscos, sin comillas, sin viñetas).
- Inmediatamente después salta una línea en blanco y entra al análisis.

FUENTES DE VERDAD — ANTI-ALUCINACION:
- Responderás basándote PRIORITARIAMENTE en el CONTEXTO_LEGAL_VERIFICADO que el sistema te provee desde la base de datos de Legateck (si está presente en este prompt).
- Si el dato no está en el contexto y no tienes certeza absoluta en tu entrenamiento base, responderás exactamente: "No dispongo del texto oficial exacto para esa norma en este momento. Le recomiendo consultar la Gaceta Oficial de Panamá."
- Tienes TERMINANTEMENTE PROHIBIDO inventar artículos, decretos, números de gaceta o jurisprudencia. Si dudas, dilo expresamente.

VOCABULARIO PANAMEÑO OBLIGATORIO:
- Usa ÚNICAMENTE términos panameños: "Cédula de Identidad Personal", "Aviso de Operación", "MITRADEL", "DGI", "ITBMS", "Registro Público de Panamá", "Balboas / Dólares", "CSS" (Caja de Seguro Social), "ANTAI", "MICI".
- PROHIBIDO usar términos extranjeros: DNI, RUT, IVA, AFIP, SAT ni leyes ajenas a Panamá (México, España, Colombia, etc.).

ESTILO EJECUTIVO OBLIGATORIO:
- Tono sobrio, claro y ejecutivo. Memorando de firma de alto nivel.
- Máxima concisión: elimina toda "paja", introducciones, repeticiones, advertencias genéricas, despedidas y cierres corteses.
- PROHIBIDO "#", "##", "###". Títulos en MAYÚSCULAS, en línea propia.
- Los dobles asteriscos (**texto**) solo se permiten para envolver títulos sobrios como **ASUNTO**, **AUDITORÍA**, **RESUMEN EJECUTIVO**, **CIERRE**. NUNCA para resaltar palabras sueltas dentro de párrafos.
- PROHIBIDO guiones largos divisores, líneas "---" y tablas con "|".
- Prefiere numeración 1., 2., 3. y párrafos cortos.

PRINCIPIOS DE FONDO:
- Analiza con detalle imágenes y documentos: tipo, partes, fechas, firmas, sellos, identificaciones, cláusulas, riesgos, vacíos, posibles nulidades.
- Si el usuario eligió un rol (REPRESENTACIÓN), defiende sus intereses en cada riesgo y cada recomendación.`;

// ─────────────────────────────────────────────────────────────────────────────
// BIFURCACIÓN DE FLUJO: consulta (orientación) vs accion (gestor de contratos)
// ─────────────────────────────────────────────────────────────────────────────
const CHAT_TYPE_INSTRUCTIONS: Record<"consulta" | "accion", string> = {
  consulta: `MODO ACTIVO: CONSULTOR LEGAL GENERAL (chat_type === consulta)
- Da orientación legal informativa y educativa sobre el marco jurídico panameño.
- Tienes PROHIBIDO redactar contratos, adendas, cláusulas estructuradas o cualquier documento jurídico con estructura formal.
- Si el usuario solicita redactar, generar o estructurar cualquier documento legal, DETÉN la generación inmediatamente y responde EXACTAMENTE esta frase (sin alterar ni agregar nada):
  "Para redactar, auditar o estructurar este documento legal con validez jurídica en Panamá, por favor abre un Nuevo Contrato en el Gestor de Contratos."`,

  accion: `MODO ACTIVO: GESTOR DE CONTRATOS (chat_type === accion)
- Tienes autorización total de redactar, auditar y editar contratos línea por línea bajo las leyes panameñas.
- Aplica el Código Civil, Código de Comercio, Código de Trabajo y leyes especiales vigentes en Panamá al estructurar cada cláusula.
- Si el usuario intenta cambiar radicalmente el tema legal del contrato a mitad del hilo, DETÉN la generación y responde EXACTAMENTE esta frase (sin alterar ni agregar nada):
  "He detectado un cambio de tema legal. Para mantener el orden de tus documentos y proteger la estructura de tus créditos, por favor crea un Nuevo Contrato para este asunto."`,
};

// ─────────────────────────────────────────────────────────────────────────────
// INSTRUCCIONES POR PERFIL DE USUARIO
// ─────────────────────────────────────────────────────────────────────────────
const CONTRACT_CLOSING_BLOCK = `

CIERRE OBLIGATORIO PARA ANÁLISIS DE CONTRATOS:
Cuando el usuario haya adjuntado un contrato (o pida análisis de uno), tu respuesta DEBE terminar SIEMPRE con esta línea LITERAL, sin alterarla y sin asteriscos:
He identificado las soluciones exactas para estos riesgos bajo las leyes de Panamá. ¿Deseas que genere una nueva versión de este contrato completamente corregida y optimizada a tu favor?
`;

const MODE_INSTRUCTIONS: Record<"ciudadano" | "empresa" | "abogado", string> = {
  ciudadano: `MODO CIUDADANO COMÚN ACTIVO (REGLA DE LONGITUD CRÍTICA E INVIOLABLE):
- LONGITUD MÁXIMA ABSOLUTA: 10 LÍNEAS DE TEXTO EN TOTAL para TODA la respuesta, incluyendo la línea de apertura del eslogan, auditoría, resumen y cierre. NUNCA excedas 10 líneas.
- Directo al grano, punto por punto, en español sencillo. Frases cortas.
- PROHIBIDO citar artículos, códigos, leyes o gacetas. Habla en lenguaje cotidiano.
- PROHIBIDO usar "#" o asteriscos decorativos. Sin viñetas con guion ni adornos.
- Resume sólo: (1) qué dice o pasa en una frase; (2) los 2 o 3 riesgos más peligrosos; (3) qué hacer ya.
- Si es contrato, incluye la línea de cierre obligatoria DENTRO del límite de 10 líneas.`,
  abogado: `MODO ABOGADO INDEPENDIENTE ACTIVO:
- Interlocutor: abogado panameño. Dictamen formal, técnico y SUMAMENTE conciso.
- Sin introducciones ni paja. Cada párrafo aporta valor jurídico.
- Párrafos cortos (3 a 5 líneas máximo). Nunca bloques masivos de texto.
- Cita artículos, códigos y leyes especiales con precisión, sólo cuando estés seguro.
- Títulos sobrios en MAYÚSCULAS envueltos en **...** (**ASUNTO**, **AUDITORÍA**, **RESUMEN EJECUTIVO**, **CIERRE**).
- Profundiza sólo donde aporte: naturaleza jurídica, requisitos, efectos, excepciones, cargas probatorias.`,
  empresa: `MODO CORPORACIÓN / EMPRESA ACTIVO:
- Interlocutor: directivo, gerente o representante legal. Directo al grano, sin teoría, sin paja.
- Enfócate EXCLUSIVAMENTE en riesgos financieros, multas y contingencias DGI (ITBMS, ISR, retenciones), cumplimiento comercial (MICI, Municipio) y contingencias laborales (Mitradel, CSS, prestaciones).
- Cuantifica siempre que puedas: monto de multas, plazos de prescripción, exposición económica estimada.
- Párrafos cortos y ejecutivos. Títulos sobrios en MAYÚSCULAS envueltos en **...** (**RIESGO FISCAL**, **RIESGO LABORAL**, **ACCIÓN INMEDIATA**).`,
};

// ─────────────────────────────────────────────────────────────────────────────
// buildSystemPrompt — ensambla el prompt completo con contexto RAG inyectado
// ─────────────────────────────────────────────────────────────────────────────
function buildSystemPrompt(
  chatType: "consulta" | "accion",
  mode: "ciudadano" | "empresa" | "abogado",
  roleContext?: string | null,
  legalContext?: string | null,
): string {
  const roleBlock = roleContext
    ? `\n\nREPRESENTACIÓN DEL USUARIO:\nEl usuario representa a: ${roleContext}. Todo tu análisis, riesgos identificados y recomendaciones deben proteger los intereses de esta parte específicamente.`
    : "";

  const ragBlock = legalContext && legalContext.trim().length > 0
    ? `\n\n${legalContext}`
    : "";

  return sanitizeSystemPrompt(
    `${BASE_SYSTEM_PROMPT}${ragBlock}${roleBlock}\n\n${CHAT_TYPE_INSTRUCTIONS[chatType]}\n\n${MODE_INSTRUCTIONS[mode]}\n${CONTRACT_CLOSING_BLOCK}`,
  );
}

const MIN_PDF_TEXT_CHARS = 80;

function sanitizeText(input: string): string {
  if (!input) return "";
  return input
    .replace(/\uFEFF/g, "")
    .replace(/\u0000/g, "")
    .replace(/[\u2028\u2029]/g, "\n")
    .replace(/[\uD800-\uDFFF]/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .normalize("NFC")
    .trim();
}

function sanitizeSystemPrompt(input: string): string {
  const withoutTypographicMarks = sanitizeText(input)
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014\u2015]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .replace(/[\u200B-\u200D\u2060]/g, "")
    .replace(/[^\u0009\u000A\u000D\u0020-\u00FF]/g, "");
  const utf8Bytes = new TextEncoder().encode(withoutTypographicMarks);
  return new TextDecoder("utf-8", { fatal: false }).decode(utf8Bytes).trim();
}

function sanitizeByteStringHeaderValue(input: string): string {
  return input
    .replace(/[\u2028\u2029]/g, "")
    .replace(/\uFEFF/g, "")
    .replace(/[\uD800-\uDFFF]/g, "")
    .replace(/[^\x00-\xFF]/g, "")
    .trim();
}

function sanitizeChatPayload<T>(value: T): T {
  if (typeof value === "string") return sanitizeText(value) as T;
  if (Array.isArray(value)) return value.map((item) => sanitizeChatPayload(item)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, sanitizeChatPayload(item)]),
    ) as T;
  }
  return value;
}

async function readJsonUtf8(request: Request): Promise<unknown> {
  const bytes = new Uint8Array(await request.arrayBuffer());
  const json = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  return sanitizeChatPayload(JSON.parse(json));
}

async function downloadBytes(path: string): Promise<Uint8Array> {
  const { data, error } = await supabaseAdmin.storage.from("legal-docs").download(path);
  if (error || !data) throw new Error(`No se pudo leer el archivo: ${error?.message}`);
  return new Uint8Array(await data.arrayBuffer());
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n\n") : text;
}

async function extractDocxText(bytes: Uint8Array): Promise<string> {
  const buffer = Buffer.from(bytes);
  const result = await mammoth.extractRawText({ buffer });
  return result.value as string;
}

function sha256Hex(bytes: Uint8Array): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

async function resolveAttachments(messages: UIMessage[]): Promise<{
  messages: UIMessage[];
  firstAttachmentHash: string | null;
}> {
  const out: UIMessage[] = [];
  let firstAttachmentHash: string | null = null;

  for (const m of messages) {
    const newParts: any[] = [];
    for (const part of (m.parts as any[]) ?? []) {
      if (part?.type === "file" && typeof part.url === "string" && part.url.startsWith("storage:")) {
        const path = part.url.slice("storage:".length);
        const lower = path.toLowerCase();
        let mediaType: string = part.mediaType || "application/octet-stream";
        const filename = part.filename ?? path;

        if (lower.endsWith(".pdf")) mediaType = "application/pdf";
        else if (lower.endsWith(".docx")) mediaType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        else if (lower.endsWith(".doc")) mediaType = "application/msword";
        else if (lower.endsWith(".txt")) mediaType = "text/plain";
        else if (lower.endsWith(".png")) mediaType = "image/png";
        else if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) mediaType = "image/jpeg";

        try {
          const bytes = await downloadBytes(path);
          if (!bytes || bytes.length === 0) {
            newParts.push({
              type: "text",
              text: `[Hubo un problema al leer el documento "${filename}". Por favor, asegúrate de que no esté protegido con contraseña o intenta subirlo en formato .docx o texto.]`,
            });
            continue;
          }
          if (!firstAttachmentHash) firstAttachmentHash = sha256Hex(bytes);

          if (mediaType.startsWith("image/")) {
            const dataUrl = `data:${mediaType};base64,${toBase64(bytes)}`;
            newParts.push({ type: "file", filename, mediaType, url: dataUrl });
            continue;
          }

          if (mediaType === "application/pdf") {
            let extracted = "";
            try {
              extracted = sanitizeText(await extractPdfText(bytes));
            } catch {
              extracted = "";
            }
            if (extracted.length >= MIN_PDF_TEXT_CHARS) {
              newParts.push({
                type: "text",
                text: `<documento nombre="${filename}" tipo="pdf">\n${extracted}\n</documento>`,
              });
            } else {
              const base64 = toBase64(bytes);
              if (base64 && base64.length > 0) {
                const dataUrl = `data:application/pdf;base64,${base64}`;
                newParts.push({ type: "file", filename, mediaType: "application/pdf", url: dataUrl });
                newParts.push({
                  type: "text",
                  text: `[El documento "${filename}" parece ser un PDF escaneado sin texto seleccionable. Analízalo visualmente página por página (OCR) y extrae su contenido jurídico relevante.]`,
                });
              } else {
                newParts.push({
                  type: "text",
                  text: `[Hubo un problema al leer el documento "${filename}". Por favor, asegúrate de que no esté protegido con contraseña o intenta subirlo en formato .docx o texto.]`,
                });
              }
            }
            continue;
          }

          if (
            mediaType.includes("officedocument.wordprocessingml") ||
            mediaType === "application/msword"
          ) {
            const text = sanitizeText(await extractDocxText(bytes));
            newParts.push({
              type: "text",
              text: `<documento nombre="${filename}" tipo="word">\n${text}\n</documento>`,
            });
            continue;
          }

          if (mediaType.startsWith("text/")) {
            const text = sanitizeText(new TextDecoder("utf-8").decode(bytes));
            newParts.push({
              type: "text",
              text: `<documento nombre="${filename}" tipo="texto">\n${text}\n</documento>`,
            });
            continue;
          }

          newParts.push({ type: "text", text: `[Formato no soportado: ${filename} (${mediaType})]` });
        } catch (e: any) {
          console.error("[chat] attachment processing failed", e);
          newParts.push({
            type: "text",
            text: `[Hubo un problema al leer este documento. Por favor, asegúrate de que no esté protegido con contraseña o intenta subirlo en formato .docx o texto.]`,
          });
        }
      } else {
        newParts.push(part);
      }
    }
    out.push({ ...m, parts: newParts });
  }
  return { messages: out, firstAttachmentHash };
}

async function getUserIdFromRequest(request: Request): Promise<string | null> {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  const SUPABASE_URL = process.env.SUPABASE_URL!;
  const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;
  const sb = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb.auth.getClaims(token);
  if (error || !data?.claims?.sub) return null;
  return data.claims.sub as string;
}

function jsonError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const userId = await getUserIdFromRequest(request);
        if (!userId) return new Response("Unauthorized", { status: 401 });

        const body = (await readJsonUtf8(request)) as {
          messages?: UIMessage[];
          threadId?: string;
          mode?: "ciudadano" | "empresa" | "abogado";
          role?: string | null;
          chat_type?: "consulta" | "accion";
        };
        const { messages, threadId } = body;
        const mode: "ciudadano" | "empresa" | "abogado" =
          body.mode && ["ciudadano", "empresa", "abogado"].includes(body.mode) ? body.mode : "abogado";
        const chatType: "consulta" | "accion" =
          body.chat_type === "accion" ? "accion" : "consulta";
        const roleContext = typeof body.role === "string" && body.role.trim().length > 0
          ? body.role.trim().slice(0, 120)
          : null;
        if (!Array.isArray(messages) || !threadId) {
          return new Response("Bad request", { status: 400 });
        }

        const { data: thread, error: tErr } = await supabaseAdmin
          .from("threads")
          .select("id, user_id, title, locked_document_id, locked_topic, plan_at_creation")
          .eq("id", threadId)
          .maybeSingle();
        if (tErr || !thread || thread.user_id !== userId) {
          return new Response("Forbidden", { status: 403 });
        }

        // Cargar plan del usuario
        const plan = await getUserPlan(userId);

        const lastUser = [...messages].reverse().find((m) => m.role === "user");
        const isFirstMessage = thread.title === "Nueva consulta";
        const lastUserText = ((lastUser?.parts as any[]) ?? [])
          .filter((p) => p.type === "text")
          .map((p) => p.text)
          .join(" ")
          .trim();

        // ---- Resolución de attachments y hash del primer archivo ----
        const { messages: resolved, firstAttachmentHash } = await resolveAttachments(messages);

        // ---- Validaciones del Pase Único (desactivadas en TRIAL_MODE) ----
        if (!TRIAL_MODE && thread.plan_at_creation === "pase_unico" && thread.locked_document_id) {
          if (firstAttachmentHash && firstAttachmentHash !== thread.locked_document_id) {
            return jsonError(
              402,
              "PASS_LOCKED_DOCUMENT",
              "Este Pase Único está amarrado a tu documento original. Para auditar un documento distinto, adquiere más créditos.",
            );
          }
          if (thread.locked_topic && lastUserText.length >= 20) {
            const topicWords = new Set(
              thread.locked_topic.toLowerCase().split(/\W+/).filter((w) => w.length >= 5),
            );
            if (topicWords.size >= 3) {
              const newWords = new Set(
                lastUserText.toLowerCase().split(/\W+/).filter((w) => w.length >= 5),
              );
              let overlap = 0;
              for (const w of topicWords) if (newWords.has(w)) overlap++;
              if (overlap / topicWords.size < 0.15) {
                return jsonError(
                  402,
                  "PASS_LOCKED_TOPIC",
                  "Este Pase Único está amarrado a la consulta original. Para cambiar de tema, adquiere más créditos.",
                );
              }
            }
          }
        }

        // ---- Consumo de crédito (desactivado en TRIAL_MODE) ----
        if (!TRIAL_MODE && isFirstMessage) {
          try {
            await consumeCredit({ userId, reason: "consume_analysis", threadId });
          } catch (e: any) {
            if (e.message === "INSUFFICIENT_CREDITS") {
              return jsonError(
                402,
                "INSUFFICIENT_CREDITS",
                "No tienes créditos disponibles. Adquiere un plan para iniciar una nueva consulta.",
              );
            }
            throw e;
          }

          const updates: {
            plan_at_creation?: string;
            locked_document_id?: string;
            locked_topic?: string;
          } = {};
          if (plan.plan_id === "pase_unico") {
            updates.plan_at_creation = "pase_unico";
            if (firstAttachmentHash) updates.locked_document_id = firstAttachmentHash;
            if (lastUserText) updates.locked_topic = lastUserText.slice(0, 500);
          } else if (plan.plan_id) {
            updates.plan_at_creation = plan.plan_id;
          }
          if (Object.keys(updates).length > 0) {
            await supabaseAdmin.from("threads").update(updates).eq("id", threadId);
          }
        }

        const anthropicKey = sanitizeByteStringHeaderValue(process.env.ANTHROPIC_API_KEY ?? "");
        if (!anthropicKey) return new Response("Missing ANTHROPIC_API_KEY", { status: 500 });

        // ── RAG: buscar contexto legal antes de llamar a Anthropic ──────────
        let legalContext = "";
        if (lastUserText.length >= 5) {
          try {
            legalContext = await getLegalContext(lastUserText);
          } catch (ragErr) {
            // RAG falla silenciosamente — la IA responde con su conocimiento base
            console.warn("[chat] RAG lookup failed (non-fatal):", ragErr);
          }
        }

        const anthropic = createAnthropic({ apiKey: anthropicKey });
        const model = anthropic("claude-sonnet-4-6");

        if (lastUser) {
          await supabaseAdmin.from("messages").insert({
            thread_id: threadId,
            user_id: userId,
            role: "user",
            parts: lastUser.parts as any,
          });
        }

        if (thread.title === "Nueva consulta" && lastUser) {
          const text = lastUserText.slice(0, 80).trim();
          if (text) {
            await supabaseAdmin.from("threads").update({ title: text }).eq("id", threadId);
          }
        }

        const result = streamText({
          model,
          system: buildSystemPrompt(chatType, mode, roleContext, legalContext),
          messages: await convertToModelMessages(resolved as UIMessage[]),
        });

        return result.toUIMessageStreamResponse({
          originalMessages: messages,
          onError: (error: any) => {
            console.error("[chat] stream error", error);
            const msg = String(error?.message ?? error ?? "");
            if (/pdf.*empty|document.*source|base64/i.test(msg)) {
              return "Hubo un problema al leer este documento. Por favor, asegúrate de que no esté protegido con contraseña o intenta subirlo en formato .docx o texto.";
            }
            return "Ocurrió un problema procesando tu consulta. Intenta nuevamente en unos segundos.";
          },
          onFinish: async ({ messages: finalMessages }) => {
            const assistant = [...finalMessages].reverse().find((m) => m.role === "assistant");
            if (!assistant) return;
            await supabaseAdmin.from("messages").insert({
              thread_id: threadId,
              user_id: userId,
              role: "assistant",
              parts: assistant.parts as any,
            });
            await supabaseAdmin
              .from("threads")
              .update({ updated_at: new Date().toISOString() })
              .eq("id", threadId);
          },
        });
      },
    },
  },
});
