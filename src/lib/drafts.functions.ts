import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function sanitizeHeaderValue(input: string): string {
  return input
    .replace(/[\u2028\u2029]/g, "")
    .replace(/\uFEFF/g, "")
    .replace(/[\uD800-\uDFFF]/g, "")
    .replace(/[^\x00-\xFF]/g, "")
    .trim();
}

const DraftSchema = z.object({
  contractType: z.string().min(2).max(200),
  partyRole: z.string().min(2).max(200),
  partyName: z.string().min(1).max(200).optional(),
  counterpartyName: z.string().min(1).max(200).optional(),
  jurisdiction: z.string().max(120).optional(),
  governingLaw: z.string().max(120).optional(),
  notes: z.string().max(4000).optional(),
});

export type DraftInput = z.infer<typeof DraftSchema>;

export const generateContractDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: DraftInput) => DraftSchema.parse(input))
  .handler(async ({ data }) => {
    const apiKey = sanitizeHeaderValue(process.env.ANTHROPIC_API_KEY ?? "");
    if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");

    const anthropic = createAnthropic({ apiKey });
    const model = anthropic("claude-sonnet-4-6");

    const system = `Eres un abogado redactor experto en la legislación de la República de Panamá. Tu tarea es producir borradores contractuales completos, ejecutables ante notario panameño cuando corresponda, redactados en español jurídico formal y conformes con el Código Civil, Código de Comercio, Código de Trabajo y leyes especiales aplicables de Panamá.

REGLAS:
- Redacta el contrato con los términos MÁS FAVORABLES posibles para la parte indicada por el usuario, sin caer en cláusulas manifiestamente nulas o leoninas.
- Incluye encabezado, comparecientes (con espacios [NOMBRE], [CÉDULA/RUC], [DOMICILIO] cuando falten datos), antecedentes, cláusulas numeradas y firma.
- Cláusulas mínimas según la naturaleza del contrato: objeto, precio/contraprestación, plazo, obligaciones de cada parte, garantías, confidencialidad, propiedad intelectual cuando aplique, indemnidad, terminación, fuerza mayor, notificaciones, cesión, ley aplicable (Panamá) y jurisdicción (tribunales de la República de Panamá o arbitraje en CeCAP), solución de controversias, e idioma.
- Cita artículos relevantes del derecho panameño en una sección final "Fundamento Legal" (sólo referencias de las que estés seguro).
- No inventes citas. Si no estás seguro de un número de artículo, omítelo.
- Devuelve únicamente Markdown limpio: título con #, secciones con ##, cláusulas con ### o numeración 1., 2., 3.`;

    const userMsg = `Genera un borrador completo del siguiente contrato bajo la legislación de Panamá.

- Tipo de contrato: ${data.contractType}
- Parte que represento (favorecer sus intereses): ${data.partyRole}
- Nombre de mi parte: ${data.partyName ?? "[POR DEFINIR]"}
- Contraparte: ${data.counterpartyName ?? "[POR DEFINIR]"}
- Jurisdicción/Ciudad: ${data.jurisdiction ?? "Ciudad de Panamá, República de Panamá"}
- Ley aplicable: ${data.governingLaw ?? "República de Panamá"}
- Notas y condiciones adicionales: ${data.notes ?? "Ninguna especificada."}

Entrega un contrato listo para revisión y firma, con cláusulas robustas que protejan los intereses de mi parte.`;

    const { text } = await generateText({
      model,
      system,
      messages: [{ role: "user", content: userMsg }],
    });

    return { markdown: text };
  });
