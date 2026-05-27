import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createThread, listThreads } from "@/lib/threads.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FileText, MessageSquare, ShieldCheck, Sparkles, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchThreads = useServerFn(listThreads);
  const create = useServerFn(createThread);

  const { data: threads = [] } = useQuery({ queryKey: ["threads"], queryFn: () => fetchThreads() });

  const newChat = useMutation({
    mutationFn: () => create({ data: {} }),
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ["threads"] });
      navigate({ to: "/chat/$threadId", params: { threadId: t!.id } });
    },
  });

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl p-8 lg:p-12 space-y-10">
        <header className="space-y-3">
          <div className="text-[10px] uppercase tracking-[0.22em] text-gold">Dashboard</div>
          <h1 className="text-3xl lg:text-4xl font-semibold tracking-tight">
            Bienvenido a <span className="text-gold">Legateck</span>
          </h1>
          <p className="text-muted-foreground max-w-2xl">
            Su asistente legal de IA para la República de Panamá. Audite documentos, redacte cláusulas y obtenga análisis fundamentados en el marco jurídico panameño.
          </p>
        </header>

        <Card className="p-8 bg-gradient-hero border-border/60 shadow-elegant relative overflow-hidden">
          <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-gradient-gold opacity-20 blur-3xl" />
          <div className="relative flex flex-col lg:flex-row lg:items-center gap-6 justify-between">
            <div className="space-y-2 max-w-xl">
              <h2 className="text-2xl font-semibold tracking-tight">Iniciar nueva auditoría</h2>
              <p className="text-muted-foreground">
                Suba un contrato, demanda o escritura y consulte al asistente. Soporta PDF y Word.
              </p>
            </div>
            <Button
              onClick={() => newChat.mutate()}
              disabled={newChat.isPending}
              size="lg"
              className="bg-gradient-gold text-primary-foreground hover:opacity-95 shadow-glow"
            >
              Nueva consulta <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </Card>

        <section className="grid sm:grid-cols-3 gap-4">
          <Feature icon={FileText} title="Análisis documental" body="Identifica cláusulas, riesgos y vacíos en contratos panameños." />
          <Feature icon={Sparkles} title="IA contextual" body="Respuestas basadas en el Código Civil, Comercial y Procesal." />
          <Feature icon={ShieldCheck} title="Confidencialidad" body="Documentos cifrados; sólo usted accede a sus consultas." />
        </section>

        <section>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm uppercase tracking-[0.18em] text-muted-foreground">Consultas recientes</h3>
          </div>
          <div className="grid gap-2">
            {threads.length === 0 && (
              <Card className="p-8 text-center border-dashed border-border/60">
                <MessageSquare className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Sus consultas aparecerán aquí.</p>
              </Card>
            )}
            {threads.slice(0, 8).map((t) => (
              <button
                key={t.id}
                onClick={() => navigate({ to: "/chat/$threadId", params: { threadId: t.id } })}
                className="group flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-card hover:bg-accent transition-colors px-4 py-3 text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <MessageSquare className="h-4 w-4 text-gold shrink-0" />
                  <span className="truncate">{t.title}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(t.updated_at).toLocaleDateString("es-PA", { day: "2-digit", month: "short", year: "numeric" })}
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function Feature({ icon: Icon, title, body }: { icon: any; title: string; body: string }) {
  return (
    <Card className="p-5 bg-card/60 border-border/60 hover:border-border transition-colors">
      <Icon className="h-5 w-5 text-gold mb-3" />
      <div className="font-medium mb-1">{title}</div>
      <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
    </Card>
  );
}
