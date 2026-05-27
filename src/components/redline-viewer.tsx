import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Lock, Loader2, ShieldCheck } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { unlockRedline } from "@/lib/redline.functions";
import { toast } from "sonner";

type Segment = { type: "del" | "add" | "text"; value: string };

function parseMarked(marked: string): Segment[] {
  const segs: Segment[] = [];
  const re = /\[\[(DEL|ADD)\]\]([\s\S]*?)\[\[\/\1\]\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(marked))) {
    if (m.index > last) segs.push({ type: "text", value: marked.slice(last, m.index) });
    segs.push({ type: m[1].toLowerCase() as "del" | "add", value: m[2] });
    last = m.index + m[0].length;
  }
  if (last < marked.length) segs.push({ type: "text", value: marked.slice(last) });
  return segs;
}

export function RedlineViewer({
  redlineId,
  preview,
  onUnlocked,
  onUpgradeNeeded,
}: {
  redlineId: string;
  preview: string;
  onUnlocked?: () => void;
  onUpgradeNeeded: () => void;
}) {
  const unlock = useServerFn(unlockRedline);
  const qc = useQueryClient();
  const [paid, setPaid] = useState(false);
  const [docxBase64, setDocxBase64] = useState<string | null>(null);
  const [filename, setFilename] = useState<string>("Contrato.docx");

  const segments = useMemo(() => parseMarked(preview), [preview]);

  const payMut = useMutation({
    mutationFn: () => unlock({ data: { redlineId } }),
    onSuccess: (res) => {
      if ((res as any).error === "INSUFFICIENT_CREDITS") {
        toast.error("No tienes créditos suficientes.");
        onUpgradeNeeded();
        return;
      }
      setPaid(true);
      setDocxBase64((res as any).docx_base64);
      setFilename((res as any).filename);
      qc.invalidateQueries({ queryKey: ["credits"] });
      toast.success("Documento desbloqueado.");
      onUnlocked?.();
    },
    onError: (e: any) => toast.error(e.message ?? "Error al desbloquear"),
  });

  const download = () => {
    if (!docxBase64) return;
    const bin = atob(docxBase64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-xl border border-gold/40 bg-gradient-to-br from-card to-card/40 overflow-hidden shadow-elegant">
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-3 bg-background/40">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-gold" />
          <span className="text-sm font-semibold">Vista previa — Contrato Blindado (Control de Cambios)</span>
        </div>
        {paid ? (
          <Button size="sm" onClick={download} className="bg-gradient-gold text-primary-foreground">
            <Download className="h-3.5 w-3.5" /> Descargar .docx
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={() => payMut.mutate()}
            disabled={payMut.isPending}
            className="bg-gradient-gold text-primary-foreground"
          >
            {payMut.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Lock className="h-3.5 w-3.5" />
            )}
            Desbloquear (1 crédito)
          </Button>
        )}
      </div>

      <div className="relative">
        <div
          className={
            paid
              ? "p-5 max-h-[500px] overflow-auto whitespace-pre-wrap text-[14px] leading-relaxed"
              : "p-5 max-h-[500px] overflow-hidden whitespace-pre-wrap text-[14px] leading-relaxed select-none [user-select:none] [-webkit-user-select:none] pointer-events-none"
          }
          onCopy={(e) => {
            if (!paid) e.preventDefault();
          }}
          onContextMenu={(e) => {
            if (!paid) e.preventDefault();
          }}
        >
          {segments.map((s, i) => {
            if (s.type === "del") {
              return (
                <span key={i} className="line-through text-destructive/80 bg-destructive/10 px-0.5 rounded">
                  {s.value}
                </span>
              );
            }
            if (s.type === "add") {
              return (
                <span
                  key={i}
                  className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 px-0.5 rounded font-medium"
                >
                  {s.value}
                </span>
              );
            }
            return <span key={i}>{s.value}</span>;
          })}
        </div>
        {!paid && (
          <>
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-background/60 to-background" />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="rotate-[-12deg] rounded-md border-2 border-gold/60 bg-background/80 px-6 py-2 text-sm font-bold uppercase tracking-[0.25em] text-gold shadow-glow backdrop-blur">
                Vista previa bloqueada
              </div>
            </div>
          </>
        )}
      </div>

      <div className="border-t border-border/50 px-4 py-2 text-[11px] text-muted-foreground bg-background/40">
        Adiciones de protección legal en verde. Texto retirado tachado en rojo. La descarga editable se habilita tras el cobro.
      </div>
    </div>
  );
}
