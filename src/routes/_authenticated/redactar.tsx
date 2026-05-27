import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { generateContractDraft } from "@/lib/drafts.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { FileSignature, Loader2, Copy, Check } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/redactar")({
  component: RedactarPage,
});

const CONTRACT_TYPES = [
  "Contrato de Arrendamiento",
  "Contrato de Compraventa",
  "Contrato de Prestación de Servicios",
  "Contrato de Trabajo",
  "Contrato de Confidencialidad (NDA)",
  "Contrato de Suministro",
  "Contrato de Distribución",
  "Contrato de Mandato",
  "Contrato de Préstamo",
  "Contrato de Sociedad",
  "Otro",
];

function RedactarPage() {
  const generate = useServerFn(generateContractDraft);
  const [contractType, setContractType] = useState("Contrato de Prestación de Servicios");
  const [customType, setCustomType] = useState("");
  const [partyRole, setPartyRole] = useState("");
  const [partyName, setPartyName] = useState("");
  const [counterpartyName, setCounterpartyName] = useState("");
  const [jurisdiction, setJurisdiction] = useState("Ciudad de Panamá, República de Panamá");
  const [notes, setNotes] = useState("");
  const [copied, setCopied] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      generate({
        data: {
          contractType: contractType === "Otro" ? customType : contractType,
          partyRole,
          partyName: partyName || undefined,
          counterpartyName: counterpartyName || undefined,
          jurisdiction: jurisdiction || undefined,
          notes: notes || undefined,
        },
      }),
    onError: (e: any) => toast.error(e.message ?? "Error al generar el borrador"),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!partyRole.trim()) {
      toast.error("Indique qué parte es usted en el contrato");
      return;
    }
    if (contractType === "Otro" && !customType.trim()) {
      toast.error("Especifique el tipo de contrato");
      return;
    }
    mutation.mutate();
  };

  const onCopy = async () => {
    if (!mutation.data?.markdown) return;
    await navigator.clipboard.writeText(mutation.data.markdown);
    setCopied(true);
    toast.success("Borrador copiado al portapapeles");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl p-8 lg:p-12 space-y-8">
        <header className="space-y-3">
          <div className="text-[10px] uppercase tracking-[0.22em] text-gold">Redacción asistida</div>
          <h1 className="text-3xl lg:text-4xl font-semibold tracking-tight flex items-center gap-3">
            <span className="h-10 w-10 rounded-md bg-gradient-gold flex items-center justify-center shadow-glow">
              <FileSignature className="h-5 w-5 text-primary-foreground" />
            </span>
            Redactar desde Cero
          </h1>
          <p className="text-muted-foreground max-w-2xl">
            Genere un borrador legal completo conforme a las leyes de la República de Panamá, con los términos más favorables para su posición.
          </p>
        </header>

        <div className="grid lg:grid-cols-5 gap-6">
          <Card className="lg:col-span-2 p-6 bg-card/60 border-border/60 h-fit">
            <form onSubmit={onSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="ctype">Tipo de contrato</Label>
                <select
                  id="ctype"
                  value={contractType}
                  onChange={(e) => setContractType(e.target.value)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {CONTRACT_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                {contractType === "Otro" && (
                  <Input
                    placeholder="Especifique el tipo de contrato"
                    value={customType}
                    onChange={(e) => setCustomType(e.target.value)}
                  />
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="role">¿Qué parte es usted? *</Label>
                <Input
                  id="role"
                  placeholder="Ej: Arrendador, Comprador, Empleador, Prestador del servicio..."
                  value={partyRole}
                  onChange={(e) => setPartyRole(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  El contrato se redactará favoreciendo los intereses de esta parte.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="pname">Nombre de mi parte (opcional)</Label>
                  <Input id="pname" placeholder="Persona o empresa" value={partyName} onChange={(e) => setPartyName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cname">Nombre de la contraparte (opcional)</Label>
                  <Input id="cname" placeholder="Persona o empresa" value={counterpartyName} onChange={(e) => setCounterpartyName(e.target.value)} />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="jur">Jurisdicción / Ciudad</Label>
                <Input id="jur" value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Condiciones específicas (opcional)</Label>
                <Textarea
                  id="notes"
                  rows={5}
                  placeholder="Monto, plazo, penalidades, exclusividad, cláusulas particulares que desee incluir..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              <Button
                type="submit"
                disabled={mutation.isPending}
                className="w-full bg-gradient-gold text-primary-foreground hover:opacity-95 shadow-glow"
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generando borrador...
                  </>
                ) : (
                  <>Generar borrador</>
                )}
              </Button>
            </form>
          </Card>

          <Card className="lg:col-span-3 p-0 bg-card/60 border-border/60 min-h-[480px] flex flex-col">
            <div className="flex items-center justify-between border-b border-border/50 px-5 py-3">
              <div className="text-sm font-medium">Borrador generado</div>
              {mutation.data?.markdown && (
                <Button size="sm" variant="ghost" onClick={onCopy} className="h-8">
                  {copied ? <Check className="h-3.5 w-3.5 mr-1.5" /> : <Copy className="h-3.5 w-3.5 mr-1.5" />}
                  {copied ? "Copiado" : "Copiar"}
                </Button>
              )}
            </div>
            <div className="flex-1 overflow-auto p-5">
              {!mutation.data && !mutation.isPending && (
                <div className="h-full flex items-center justify-center text-center">
                  <div className="space-y-2 max-w-sm">
                    <FileSignature className="h-8 w-8 text-muted-foreground mx-auto" />
                    <p className="text-sm text-muted-foreground">
                      Complete el formulario y genere su borrador legal. Aparecerá aquí listo para copiar.
                    </p>
                  </div>
                </div>
              )}
              {mutation.isPending && (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 mr-2 animate-spin text-gold" /> Redactando contrato...
                </div>
              )}
              {mutation.data?.markdown && (
                <pre className="whitespace-pre-wrap font-sans text-[14px] leading-relaxed text-foreground">
                  {mutation.data.markdown}
                </pre>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
