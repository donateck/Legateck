import { createFileRoute, redirect, Outlet, Link, useNavigate, useRouter, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listThreads, createThread, deleteThread } from "@/lib/threads.functions";
import { getMyCredits } from "@/lib/credits.functions";
import { LegateckLogo } from "@/components/legateck-logo";
import { CreditsBadge } from "@/components/credits-badge";
import { UpgradeDialog } from "@/components/upgrade-dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, MessageSquare, Trash2, LogOut, LayoutDashboard, FileSearch, Settings, FileSignature } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { TRIAL_MODE } from "@/lib/trial-mode";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  component: AuthLayout,
});

function AuthLayout() {
  const router = useRouter();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchThreads = useServerFn(listThreads);
  const fetchCredits = useServerFn(getMyCredits);
  const create = useServerFn(createThread);
  const del = useServerFn(deleteThread);
  const [userEmail, setUserEmail] = useState<string>("");
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? ""));
  }, []);

  const { data: credits } = useQuery({
    queryKey: ["credits"],
    queryFn: () => fetchCredits(),
    enabled: !TRIAL_MODE,
  });
  const noCredits = !TRIAL_MODE && !!credits && !credits.is_unlimited && credits.credits_remaining <= 0;

  const { data: threads = [] } = useQuery({
    queryKey: ["threads"],
    queryFn: () => fetchThreads(),
  });

  const createMut = useMutation({
    mutationFn: () => create({ data: {} }),
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ["threads"] });
      navigate({ to: "/chat/$threadId", params: { threadId: t!.id } });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["threads"] });
      toast.success("Conversación eliminada");
    },
  });

  const onLogout = async () => {
    await supabase.auth.signOut();
    router.invalidate();
    navigate({ to: "/login" });
  };

  // Active thread id from URL (if any)
  const activeThreadId = (useParams({ strict: false }) as { threadId?: string }).threadId;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      {/* Sidebar */}
      <aside className="hidden md:flex w-72 flex-col border-r border-border/50 bg-sidebar">
        <div className="p-5 border-b border-sidebar-border/70">
          <LegateckLogo />
        </div>

        <div className="p-3 space-y-1">
          <NavLink to="/dashboard" icon={LayoutDashboard} label="Dashboard" />
          <NavLink to="/redactar" icon={FileSignature} label="Redactar desde Cero" />
          <NavLink to="/dashboard" icon={FileSearch} label="Auditoría documental" disabled />
          <NavLink to="/dashboard" icon={Settings} label="Configuración" disabled />
        </div>

        <div className="px-4 pt-2 pb-1 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Consultas</span>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-gold hover:bg-sidebar-accent disabled:opacity-40"
            onClick={() => {
              if (noCredits) { setUpgradeOpen(true); return; }
              createMut.mutate();
            }}
            disabled={createMut.isPending}
            title={noCredits ? "Sin créditos — adquiere un plan" : "Nueva consulta"}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <ScrollArea className="flex-1 px-2">
          <div className="space-y-1 pb-3">
            {threads.length === 0 && (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                No hay consultas todavía.
              </div>
            )}
            {threads.map((t) => {
              const active = t.id === activeThreadId;
              return (
                <div
                  key={t.id}
                  className={cn(
                    "group flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                    active ? "bg-sidebar-accent text-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent/60",
                  )}
                >
                  <Link
                    to="/chat/$threadId"
                    params={{ threadId: t.id }}
                    className="flex flex-1 items-center gap-2 min-w-0"
                  >
                    <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{t.title}</span>
                  </Link>
                  <button
                    onClick={() => {
                      if (confirm("¿Eliminar esta consulta?")) deleteMut.mutate(t.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <div className="border-t border-sidebar-border/70 p-3 space-y-2">
          {TRIAL_MODE ? (
            <div className="flex items-center gap-2 rounded-md border border-gold/40 bg-gold/5 px-3 py-2 text-[11px] text-gold">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-gold animate-pulse" />
              <span className="font-semibold tracking-wide">Modo Prueba Libre</span>
              <span className="text-muted-foreground">· consultas ilimitadas</span>
            </div>
          ) : (
            <CreditsBadge onUpgrade={() => setUpgradeOpen(true)} />
          )}
          <div className="flex items-center gap-3 px-2 py-1.5">
            <div className="h-8 w-8 rounded-full bg-gradient-gold flex items-center justify-center text-xs font-semibold text-primary-foreground">
              {userEmail.slice(0, 1).toUpperCase() || "L"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="truncate text-sm text-foreground">{userEmail || "Abogado"}</div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Cuenta profesional</div>
            </div>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onLogout} title="Cerrar sesión">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
      {!TRIAL_MODE && <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} />}
    </div>
  );
}

function NavLink({ to, icon: Icon, label, disabled }: { to: string; icon: any; label: string; disabled?: boolean }) {
  if (disabled) {
    return (
      <div className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground/60 cursor-not-allowed">
        <Icon className="h-4 w-4" /> {label}
      </div>
    );
  }
  return (
    <Link
      to={to}
      className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
      activeProps={{ className: "bg-sidebar-accent text-foreground" }}
    >
      <Icon className="h-4 w-4" /> {label}
    </Link>
  );
}
