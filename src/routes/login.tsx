import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { LegateckLogo } from "@/components/legateck-logo";
import { toast } from "sonner";
import { Loader2, ShieldCheck, ShieldAlert, Lock, Zap, Target, X, Check } from "lucide-react";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Sesión iniciada");
        navigate({ to: "/dashboard" });
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        toast.success("Cuenta creada. Iniciando sesión...");
        navigate({ to: "/dashboard" });
      }
    } catch (err: any) {
      toast.error(err.message ?? "Error de autenticación");
    } finally {
      setLoading(false);
    }
  };

  const onGoogle = async () => {
    setLoading(true);
    const res = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/dashboard" });
    if (res.error) { toast.error(res.error.message ?? "Error con Google"); setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-hero relative">
      <div
        className="absolute inset-x-0 top-0 h-screen opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle at 25% 20%, oklch(0.78 0.12 78) 0, transparent 40%), radial-gradient(circle at 80% 80%, oklch(0.5 0.1 250) 0, transparent 45%)",
        }}
      />
      <div className="relative grid min-h-screen lg:grid-cols-[1.15fr_1fr]">
        {/* LEFT — Cuadro comparativo premium */}
        <div className="flex flex-col p-6 sm:p-10 lg:p-12 border-b lg:border-b-0 lg:border-r border-border/40 overflow-y-auto">
          <Link to="/login" className="mb-6"><LegateckLogo /></Link>

          <div className="space-y-3 mb-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-gold/50 bg-gold/5 px-3 py-1 text-[10px] uppercase tracking-widest text-gold">
              <Lock className="h-3 w-3" /> Legal-Tech especializado en Panamá
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight leading-tight">
              ¿Por qué <span className="text-gold">Legateck</span> y no una IA genérica?
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xl">
              Compare lo que recibe de un chatbot público frente al dictamen blindado de Legateck.
            </p>
          </div>

          {/* Tabla comparativa */}
          <div className="rounded-2xl border border-border/60 bg-card/50 overflow-hidden shadow-elegant">
            {/* Encabezados */}
            <div className="grid grid-cols-[1.1fr_1fr_1fr] text-[10px] uppercase tracking-widest font-semibold border-b border-border/60">
              <div className="p-3 bg-card/60 text-muted-foreground">Pilar</div>
              <div className="p-3 bg-destructive/10 text-destructive flex items-center gap-1.5">
                <X className="h-3 w-3" /> ChatGPT / Gemini / Claude
              </div>
              <div className="p-3 bg-gold/10 text-gold flex items-center gap-1.5">
                <Check className="h-3 w-3" /> Legateck 🇵🇦
              </div>
            </div>

            <CompareRow
              icon={Zap}
              pillar="Tiempo"
              subtitle="Cero flojera"
              bad="Lento. Toca escribir testamentos de instrucciones para que te entienda."
              good="Un solo clic. Subes el contrato, tocas un botón y listo. Cero chateadera."
            />
            <CompareRow
              icon={Target}
              pillar="Precisión"
              subtitle="Tu defensor"
              bad="Genérica. Mezcla leyes de internet de otros países y da respuestas neutrales."
              good="Leyes de Panamá. Específico para TI y para tu posición dentro del contrato."
            />
            <CompareRow
              icon={ShieldCheck}
              pillar="Seguridad"
              subtitle="Blindaje"
              bad="Peligroso. Regalas tus contratos y datos privados para entrenar su IA pública."
              good="Blindado. Canal corporativo cifrado. Tus datos mueren al cerrar la sesión."
              last
            />
          </div>

          <div className="mt-6 rounded-xl border border-gold/40 bg-gradient-to-r from-gold/10 via-gold/5 to-transparent p-4 text-center">
            <p className="text-base sm:text-lg font-semibold tracking-tight">
              <span className="text-gold">Legateck</span> es el abogado de <span className="text-gold">TU</span> lado.
            </p>
          </div>

          <div className="mt-auto pt-6 text-[11px] text-muted-foreground">
            © {new Date().getFullYear()} Legateck · Apto para firmas y departamentos legales en Panamá.
          </div>
        </div>

        {/* RIGHT — Form */}
        <div className="flex items-center justify-center p-6 sm:p-10 lg:p-12 bg-card/20">
          <Card className="w-full max-w-md p-8 bg-card/90 backdrop-blur border-border/60 shadow-elegant">
            <h2 className="text-2xl font-semibold tracking-tight">
              {mode === "signin" ? "Acceso a la plataforma" : "Cree su cuenta"}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {mode === "signin" ? "Ingrese sus credenciales para continuar." : "Modo Prueba Libre: consultas ilimitadas durante el lanzamiento."}
            </p>

            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              {mode === "signup" && (
                <div className="space-y-1.5">
                  <Label htmlFor="name">Nombre completo</Label>
                  <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Lic. María González" required />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="email">Correo electrónico</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="abogado@bufete.com" required autoComplete="email" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Contraseña</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={8} />
              </div>

              <Button type="submit" disabled={loading} className="w-full bg-gradient-gold text-primary-foreground hover:opacity-95 shadow-glow">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {mode === "signin" ? "Iniciar sesión" : "Crear cuenta"}
              </Button>
            </form>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border/60" /></div>
              <div className="relative flex justify-center text-xs uppercase tracking-widest"><span className="bg-card px-3 text-muted-foreground">o continúe con</span></div>
            </div>

            <Button type="button" variant="outline" onClick={onGoogle} disabled={loading} className="w-full border-border/60">
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24"><path fill="#EA4335" d="M12 11v3.2h4.5c-.2 1.2-1.4 3.6-4.5 3.6-2.7 0-4.9-2.2-4.9-5s2.2-5 4.9-5c1.6 0 2.6.7 3.2 1.2l2.2-2.1C16 5.5 14.2 4.7 12 4.7 7.9 4.7 4.6 8 4.6 12s3.3 7.3 7.4 7.3c4.3 0 7.1-3 7.1-7.2 0-.5-.1-.9-.1-1.1H12z"/></svg>
              Google
            </Button>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              {mode === "signin" ? "¿No tiene cuenta?" : "¿Ya tiene cuenta?"}{" "}
              <button type="button" onClick={() => setMode(mode === "signin" ? "signup" : "signin")} className="text-gold hover:underline">
                {mode === "signin" ? "Regístrese" : "Inicie sesión"}
              </button>
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}

function CompareRow({
  icon: Icon,
  pillar,
  subtitle,
  bad,
  good,
  last,
}: {
  icon: any;
  pillar: string;
  subtitle: string;
  bad: string;
  good: string;
  last?: boolean;
}) {
  return (
    <div className={`grid grid-cols-[1.1fr_1fr_1fr] ${last ? "" : "border-b border-border/60"}`}>
      <div className="p-4 bg-card/40 flex items-start gap-2.5">
        <div className="h-7 w-7 rounded-md bg-gradient-gold flex items-center justify-center shadow-glow shrink-0">
          <Icon className="h-3.5 w-3.5 text-primary-foreground" />
        </div>
        <div>
          <div className="text-sm font-semibold leading-tight">{pillar}</div>
          <div className="text-[10px] uppercase tracking-widest text-gold/80 mt-0.5">{subtitle}</div>
        </div>
      </div>
      <div className="p-4 bg-destructive/[0.04] text-xs text-muted-foreground leading-relaxed border-l border-border/60">
        {bad}
      </div>
      <div className="p-4 bg-gold/[0.06] text-xs text-foreground/90 leading-relaxed border-l border-border/60">
        {good}
      </div>
    </div>
  );
}

