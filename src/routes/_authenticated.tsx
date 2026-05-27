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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Plus,
  MessageSquare,
  Trash2,
  LogOut,
  LayoutDashboard,
  FileSearch,
  Settings,
  FileSignature,
  FileEdit,
  FilePlus2,
  FileText,
  Zap,
} from "lucide-react";
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
  const [accionModalOpen, setAccionModalOpen] = useState(false);

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

  // Separar hilos por categoría
  const consultaThreads = threads.filter((t: any) => (t.chat_type ?? "consulta") === "consulta");
  const accionThreads = threads.filter((t: any) => t.chat_type === "accion");

  const createMut = useMutation({
    mutationFn: (opts?: { chat_type?: "consulta" | "accion"; subtype?: "generar" | "revisar" }) =>
      create({ data: { chat_type: opts?.chat_type } }),
    onSuccess: (t, opts) => {
      qc.invalidateQueries({ queryKey: ["threads"] });
      // Guardar subtype en localStorage para que ChatWindow lo lea
      if (opts?.subtype && t?.id) {
        localStorage.setItem(`legateck:accion_subtype:${t.id}`, opts.subtype);
      }
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

  const openAccionModal = () => {
    if (noCredits) { setUpgradeOpen(true); return; }
    setAccionModalOpen(true);
  };

  const createAccion = (subtype: "generar" | "revisar") => {
    setAccionModalOpen(false);
    createMut.mutate({ chat_type: "accion", subtype });
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

        {/* Nav links */}
        <div className="p-3 space-y-1">
          <NavLink to="/dashboard" icon={LayoutDashboard} label="Dashboard" />
          <NavLink to="/redactar" icon={FileSignature} label="Redactar desde Cero" />
          <NavLink to="/dashboard" icon={FileSearch} label="Auditoría documental" disabled />
          <NavLink to="/dashboard" icon={Settings} label="Configuración" disabled />
        </div>

        {/* Threads — CONSULTAS + ACCIONES en scroll unificado */}
        <ScrollArea className="flex-1 px-2">
          {/* ── CONSULTAS ─────────────────────────────────── */}
          <div className="flex items-center justify-between px-2 pt-3 pb-1">
            <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Consultas
            </span>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-gold hover:bg-sidebar-accent disabled:opacity-40"
              onClick={() => {
                if (noCredits) { setUpgradeOpen(true); return; }
                createMut.mutate({ chat_type: "consulta" });
              }}
              disabled={createMut.isPending}
              title="Nueva consulta"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-1 pb-2">
            {consultaThreads.length === 0 && (
              <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                No hay consultas todavía.
              </div>
            )}
            {consultaThreads.map((t: any) => (
              <ThreadItem
                key={t.id}
                thread={t}
                active={t.id === activeThreadId}
                icon={MessageSquare}
                onDelete={() => {
                  if (confirm("¿Eliminar esta consulta?")) deleteMut.mutate(t.id);
                }}
              />
            ))}
          </div>

          {/* ── ACCIONES ──────────────────────────────────── */}
          <div className="flex items-center justify-between px-2 pt-3 pb-1 mt-1 border-t border-border/30">
            <div className="flex items-center gap-1.5">
              <Zap className="h-3 w-3 text-gold" />
              <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Acciones
              </span>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-gold hover:bg-sidebar-accent disabled:opacity-40"
              onClick={openAccionModal}
              disabled={createMut.isPending}
              title="Nueva acción"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-1 pb-4">
            {accionThreads.length === 0 && (
              <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                No hay acciones todavía.
              </div>
            )}
            {accionThreads.map((t: any) => (
              <ThreadItem
                key={t.id}
                thread={t}
                active={t.id === activeThreadId}
                icon={FileText}
                onDelete={() => {
                  if (confirm("¿Eliminar esta acción?")) deleteMut.mutate(t.id);
                }}
              />
            ))}
          </div>
        </ScrollArea>

        {/* Footer */}
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
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Cuenta profesional
              </div>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={onLogout}
              title="Cerrar sesión"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>

      {!TRIAL_MODE && <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} />}

      {/* Modal de selección de tipo de acción */}
      <Dialog open={accionModalOpen} onOpenChange={setAccionModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nueva Acción</DialogTitle>
            <DialogDescription>
              ¿Qué deseas hacer en esta sesión de trabajo?
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 pt-1">
            <button
              type="button"
              onClick={() => createAccion("generar")}
              className="group flex items-start gap-3 rounded-xl border border-border/60 bg-background/60 p-4 text-left transition-all hover:border-gold/70 hover:bg-gradient-to-br hover:from-card hover:to-card/40 hover:shadow-md"
            >
              <div className="h-9 w-9 shrink-0 rounded-md bg-muted group-hover:bg-gradient-gold flex items-center justify-center transition-colors">
                <FilePlus2 className="h-4 w-4 text-muted-foreground group-hover:text-primary-foreground" />
              </div>
              <div>
                <div className="font-semibold text-sm">Generar contrato nuevo</div>
                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                  Redacta un contrato desde cero bajo las leyes de Panamá.
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => createAccion("revisar")}
              className="group flex items-start gap-3 rounded-xl border border-border/60 bg-background/60 p-4 text-left transition-all hover:border-gold/70 hover:bg-gradient-to-br hover:from-card hover:to-card/40 hover:shadow-md"
            >
              <div className="h-9 w-9 shrink-0 rounded-md bg-muted group-hover:bg-gradient-gold flex items-center justify-center transition-colors">
                <FileEdit className="h-4 w-4 text-muted-foreground group-hover:text-primary-foreground" />
              </div>
              <div>
                <div className="font-semibold text-sm">Revisar / Editar contrato existente</div>
                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                  Adjunta un contrato para auditarlo y mejorarlo cláusula a cláusula.
                </p>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Subcomponentes
// ─────────────────────────────────────────────────────────────────────────────

function ThreadItem({
  thread,
  active,
  icon: Icon,
  onDelete,
}: {
  thread: { id: string; title: string };
  active: boolean;
  icon: any;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "group flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
        active
          ? "bg-sidebar-accent text-foreground"
          : "text-sidebar-foreground hover:bg-sidebar-accent/60",
      )}
    >
      <Link
        to="/chat/$threadId"
        params={{ threadId: thread.id }}
        className="flex flex-1 items-center gap-2 min-w-0"
      >
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{thread.title}</span>
      </Link>
      <button
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function NavLink({
  to,
  icon: Icon,
  label,
  disabled,
}: {
  to: string;
  icon: any;
  label: string;
  disabled?: boolean;
}) {
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
