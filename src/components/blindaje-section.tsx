import { ShieldAlert, ShieldCheck, Lock, EyeOff, Server, KeyRound } from "lucide-react";

export function BlindajeSection() {
  return (
    <section className="relative py-20 px-6 border-t border-border/40 bg-gradient-to-b from-background to-card/30">
      <div className="mx-auto max-w-6xl">
        <div className="text-center mb-12 space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/5 px-3 py-1 text-[10px] uppercase tracking-widest text-gold">
            <Lock className="h-3 w-3" /> Confidencialidad de grado bufete
          </div>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">
            El <span className="text-gold">Blindaje</span> Legateck
          </h2>
          <p className="text-sm text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Sus contratos contienen información sensible: cifras, partes, cláusulas, estrategia. Compare cómo se procesan en una IA pública versus en Legateck.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Peligro */}
          <div className="relative rounded-2xl border border-destructive/40 bg-destructive/[0.04] p-8 overflow-hidden">
            <div className="absolute -top-12 -right-12 h-40 w-40 rounded-full bg-destructive/10 blur-3xl" />
            <div className="relative space-y-5">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-destructive/15 flex items-center justify-center">
                  <ShieldAlert className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-destructive font-semibold">El Peligro</div>
                  <h3 className="text-lg font-semibold">ChatGPT Público y similares</h3>
                </div>
              </div>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li className="flex gap-3">
                  <EyeOff className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  <span>Sus contratos pueden ser usados para entrenar modelos de terceros, exponiendo cifras y partes.</span>
                </li>
                <li className="flex gap-3">
                  <Server className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  <span>Los datos quedan almacenados en servidores extranjeros con políticas de retención opacas.</span>
                </li>
                <li className="flex gap-3">
                  <KeyRound className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  <span>Riesgo real de filtración cruzada hacia otros usuarios y de incumplimiento de secreto profesional.</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Blindaje */}
          <div className="relative rounded-2xl border border-gold/50 bg-gradient-to-br from-card to-card/40 p-8 shadow-elegant overflow-hidden">
            <div className="absolute -top-12 -right-12 h-40 w-40 rounded-full bg-gold/15 blur-3xl" />
            <div className="relative space-y-5">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-gradient-gold flex items-center justify-center shadow-glow">
                  <ShieldCheck className="h-5 w-5 text-primary-foreground" />
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-gold font-semibold">El Blindaje</div>
                  <h3 className="text-lg font-semibold">Legateck Confidencial</h3>
                </div>
              </div>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li className="flex gap-3">
                  <Lock className="h-4 w-4 text-gold mt-0.5 shrink-0" />
                  <span>Operamos sobre la API comercial de Anthropic bajo cifrado SSL extremo a extremo.</span>
                </li>
                <li className="flex gap-3">
                  <ShieldCheck className="h-4 w-4 text-gold mt-0.5 shrink-0" />
                  <span>Por contrato comercial, está prohibido usar sus datos para entrenar modelos de IA.</span>
                </li>
                <li className="flex gap-3">
                  <EyeOff className="h-4 w-4 text-gold mt-0.5 shrink-0" />
                  <span>Procesamiento aislado por sesión: la información muere al cerrar la consulta.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <p className="mt-8 text-center text-xs uppercase tracking-widest text-muted-foreground">
          Apto para firmas de abogados y departamentos legales corporativos en Panamá.
        </p>
      </div>
    </section>
  );
}
