/**
 * LEGATECK · Motor RAG — Búsqueda en Base de Conocimiento Legal de Panamá
 *
 * Consulta la tabla legal_knowledge_base con Full-Text Search en español
 * antes de enviar el prompt a la API de Anthropic. El contexto recuperado
 * se inyecta en el System Prompt para eliminar alucinaciones.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface LegalFragment {
  id: string;
  title: string;
  content: string;
  source_pdf: string;
  law_type: string;
  article_ref: string | null;
  rank: number;
}

/**
 * Busca fragmentos legales relevantes usando Full-Text Search en español.
 * @param queryText   Texto de la consulta del usuario
 * @param lawType     Filtro opcional por tipo de ley (ej. 'proteccion_datos')
 * @param limit       Cantidad máxima de fragmentos a recuperar (default: 4)
 */
export async function searchLegalFragments(
  queryText: string,
  lawType?: string,
  limit = 4,
): Promise<LegalFragment[]> {
  if (!queryText || queryText.trim().length < 3) return [];

  try {
    const { data, error } = await supabaseAdmin.rpc("search_legal_knowledge", {
      query_text: queryText.slice(0, 500),
      p_law_type: lawType ?? null,
      p_limit: limit,
    });

    if (error) {
      console.error("[legal-rag] search_legal_knowledge RPC error:", error.message);
      return [];
    }

    return (data as LegalFragment[]) ?? [];
  } catch (e) {
    console.error("[legal-rag] unexpected error:", e);
    return [];
  }
}

/**
 * Convierte los fragmentos recuperados en un bloque de contexto
 * listo para inyectar en el System Prompt de Anthropic.
 */
export function buildLegalContextBlock(fragments: LegalFragment[]): string {
  if (!fragments.length) return "";

  const lines: string[] = [
    "CONTEXTO_LEGAL_VERIFICADO — Fragmentos oficiales recuperados de la base de datos de Legateck.",
    "INSTRUCCION: Fundamenta tu respuesta PRIORITARIAMENTE en estos textos. Cita el artículo exacto.",
    "",
  ];

  for (const f of fragments) {
    const ref = f.article_ref ? ` (${f.article_ref})` : "";
    lines.push(`--- ${f.title}${ref} ---`);
    lines.push(f.content);
    lines.push(`Fuente: ${f.source_pdf}`);
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Función principal: busca y formatea el contexto legal para el System Prompt.
 * Devuelve string vacío si no hay resultados (la IA responderá con su conocimiento base).
 */
export async function getLegalContext(
  userQuery: string,
  lawType?: string,
): Promise<string> {
  const fragments = await searchLegalFragments(userQuery, lawType, 4);
  return buildLegalContextBlock(fragments);
}
