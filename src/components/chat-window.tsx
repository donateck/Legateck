import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Paperclip, Send, FileText, Loader2, X, Scale, Users, Building2, Gavel, Sparkles, Lock, ShieldCheck, UserCheck, Scale as ScaleIcon, FilePlus2, FileEdit } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyCredits } from "@/lib/credits.functions";
import { generateRedlinePreview } from "@/lib/redline.functions";
import { detectContractParties } from "@/lib/parties.functions";
import { RedlineViewer } from "@/components/redline-viewer";
import { UpgradeDialog } from "@/components/upgrade-dialog";
import { TRIAL_MODE } from "@/lib/trial-mode";

type PendingAttachment = {
  filename: string;
  mediaType: string;
  storagePath: string;
};

export type AnalysisMode = "ciudadano" | "empresa" | "abogado";

const MODES: { id: AnalysisMode; label: string; icon: any; description: string }[] = [
  { id: "ciudadano", label: "Modo Ciudadano", icon: Users, description: "Lenguaje claro y protección de derechos." },
  { id: "empresa", label: "Modo Empresa", icon: Building2, description: "Riesgos comerciales, DGI y Mitradel." },
  { id: "abogado", label: "Modo Abogado", icon: Gavel, description: "Rigor técnico, artículos y códigos." },
];

const BYTESTRING_BREAKERS = /\u2028|\u2029/g;

function sanitizeByteStringHeaderValue(value: string): string {
  return value
    .replace(BYTESTRING_BREAKERS, "")
    .replace(/\uFEFF/g, "")
    .replace(/[\uD800-\uDFFF]/g, "")
    .replace(/[^\x00-\xFF]/g, "")
    .trim();
}

function createSafeHeaders(input?: HeadersInit): Headers {
  const headers = new Headers();
  if (!input) return headers;
  const setHeader = (key: string, value: string) => headers.set(key, sanitizeByteStringHeaderValue(value));

  if (input instanceof Headers) {
    input.forEach((value, key) => setHeader(key, value));
  } else if (Array.isArray(input)) {
    input.forEach(([key, value]) => setHeader(key, value));
  } else {
    Object.entries(input).forEach(([key, value]) => setHeader(key, value));
  }
  return headers;
}

function sanitizeChatString(value: string): string {
  return value
    .replace(BYTESTRING_BREAKERS, "")
    .replace(/\uFEFF/g, "")
    .replace(/\u0000/g, "")
    .replace(/[\uD800-\uDFFF]/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .normalize("NFC");
}

function sanitizeChatPayload<T>(value: T): T {
  if (typeof value === "string") return sanitizeChatString(value) as T;
  if (Array.isArray(value)) return value.map((item) => sanitizeChatPayload(item)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, sanitizeChatPayload(item)]),
    ) as T;
  }
  return value;
}

function encodeJsonBodyAsUtf8(body: string): BodyInit {
  let sanitizedBody = sanitizeChatString(body);
  try {
    sanitizedBody = JSON.stringify(sanitizeChatPayload(JSON.parse(sanitizedBody)));
  } catch {
    // noop
  }
  return new TextEncoder().encode(sanitizedBody) as unknown as BodyInit;
}

export function ChatWindow({
  threadId,
  title,
  chatType = "consulta",
  initialMessages,
  onTitleMaybeChanged,
}: {
  threadId: string;
  title: string;
  chatType?: "consulta" | "accion";
  initialMessages: UIMessage[];
  onTitleMaybeChanged?: () => void;
}) {
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [redline, setRedline] = useState<{ id: string; preview: string } | null>(null);
  const [parties, setParties] = useState<{ partyA: string | null; partyB: string | null } | null>(null);
  const [selectedRole, setSelectedRole] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(`legateck:role:${threadId}`);
  });
  const [pendingSubmit, setPendingSubmit] = useState<null | { text: string; attachments: PendingAttachment[] }>(null);

  // Subtype de acción (generar | revisar) — guardado en localStorage al crear el hilo
  const [accionSubtype] = useState<"generar" | "revisar" | null>(() => {
    if (typeof window === "undefined") return null;
    const v = localStorage.getItem(`legateck:accion_subtype:${threadId}`);
    return v === "generar" || v === "revisar" ? v : null;
  });

  const chatTypeRef = useRef(chatType);
  chatTypeRef.current = chatType;
  const fetchCredits = useServerFn(getMyCredits);
  const genRedline = useServerFn(generateRedlinePreview);
  const detectParties = useServerFn(detectContractParties);
  const qc = useQueryClient();
  const { data: credits } = useQuery({ queryKey: ["credits"], queryFn: () => fetchCredits(), enabled: !TRIAL_MODE });
  const noCredits = !TRIAL_MODE && !!credits && !credits.is_unlimited && credits.credits_remaining <= 0;
  const redlineMut = useMutation({
    mutationFn: () => genRedline({ data: { threadId } }),
    onSuccess: (r) => setRedline({ id: (r as any).redlineId, preview: (r as any).preview }),
    onError: (e: any) => toast.error(e.message ?? "Error generando versión corregida"),
  });
  const [mode, setMode] = useState<AnalysisMode>(() => {
    if (typeof window === "undefined") return "abogado";
    return (localStorage.getItem(`legateck:mode:${threadId}`) as AnalysisMode) || "abogado";
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const roleRef = useRef(selectedRole);
  roleRef.current = selectedRole;

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem(`legateck:mode:${threadId}`, mode);
  }, [mode, threadId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (selectedRole) localStorage.setItem(`legateck:role:${threadId}`, selectedRole);
    else localStorage.removeItem(`legateck:role:${threadId}`);
  }, [selectedRole, threadId]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => ({ threadId, mode: modeRef.current, role: roleRef.current, chat_type: chatTypeRef.current }),
        prepareSendMessagesRequest: ({ id, messages, body, trigger, messageId }) => ({
          body: sanitizeChatPayload({
            ...body,
            id,
            messages,
            trigger,
            messageId,
          }),
        }),
        fetch: async (url, init) => {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          const headers = createSafeHeaders(init?.headers);
          if (token) headers.set("authorization", `Bearer ${sanitizeByteStringHeaderValue(token)}`);

          let body = init?.body;
          if (typeof body === "string") {
            body = encodeJsonBodyAsUtf8(body);
            headers.set("content-type", "application/json; charset=utf-8");
          }

          return fetch(url, { ...init, headers, body });
        },
      }),
    [threadId],
  );

  const { messages, sendMessage, status, error } = useChat({
    id: threadId,
    messages: initialMessages,
    transport,
    onFinish: () => onTitleMaybeChanged?.(),
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [threadId, status]);

  useEffect(() => {
    if (error) toast.error(error.message ?? "Error en el asistente");
  }, [error]);

  const onPickFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("No autenticado");
      const uploaded: PendingAttachment[] = [];
      for (const file of Array.from(files)) {
        if (file.size > 20 * 1024 * 1024) {
          toast.error(`${file.name} supera 20MB`);
          continue;
        }
        const safe = file.name.replace(/[^\w.\-]+/g, "_");
        const path = `${uid}/${threadId}/${Date.now()}-${safe}`;
        const { error: upErr } = await supabase.storage.from("legal-docs").upload(path, file, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });
        if (upErr) throw upErr;
        uploaded.push({
          filename: file.name,
          mediaType: file.type || "application/octet-stream",
          storagePath: path,
        });
      }
      setAttachments((a) => [...a, ...uploaded]);
      if (uploaded.length) toast.success(`${uploaded.length} documento(s) cargado(s)`);
    } catch (e: any) {
      toast.error(e.message ?? "Error al subir documento");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const partiesMut = useMutation({
    mutationFn: (paths: string[]) => detectParties({ data: { storagePaths: paths } }),
    onError: (e: any) => toast.error(e.message ?? "No se pudo detectar las partes"),
  });

  const sendNow = (text: string, atts: PendingAttachment[]) => {
    const parts: any[] = [];
    for (const a of atts) {
      parts.push({
        type: "file",
        filename: sanitizeChatString(a.filename),
        mediaType: sanitizeChatString(a.mediaType),
        url: sanitizeChatString(`storage:${a.storagePath}`),
      });
    }
    if (text) parts.push({ type: "text", text });
    sendMessage(sanitizeChatPayload({ role: "user", parts }) as any);
    setInput("");
    setAttachments([]);
  };

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = sanitizeChatString(input).trim();
    if (!text && attachments.length === 0) return;
    if (status === "submitted" || status === "streaming") return;

    // Si hay archivos adjuntos, es el primer mensaje del hilo y aún no se eligió rol,
    // intentamos detectar partes y mostrar los 3 botones antes de analizar.
    const isFirstSend = messages.length === 0;
    if (isFirstSend && attachments.length > 0 && !selectedRole && !parties) {
      try {
        const r = await partiesMut.mutateAsync(attachments.map((a) => a.storagePath));
        if (r.partyA && r.partyB) {
          setParties({ partyA: r.partyA, partyB: r.partyB });
          setPendingSubmit({ text, attachments: [...attachments] });
          return;
        }
        // Si no se detectaron, proceder directamente
        sendNow(text, attachments);
      } catch {
        sendNow(text, attachments);
      }
      return;
    }

    sendNow(text, attachments);
  };

  const chooseRole = (role: string) => {
    setSelectedRole(role);
    setParties(null);
    if (pendingSubmit) {
      sendNow(pendingSubmit.text, pendingSubmit.attachments);
      setPendingSubmit(null);
    }
  };

  const busy = status === "submitted" || status === "streaming";
  const currentMode = MODES.find((m) => m.id === mode)!;

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-border/50 px-6 py-4 bg-card/40">
        <div className="h-8 w-8 rounded-md bg-gradient-gold flex items-center justify-center shadow-glow">
          <Scale className="h-4 w-4 text-primary-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold tracking-tight">{title}</h1>
          <p className="text-xs text-muted-foreground">
            Legateck AI ·{" "}
            {chatType === "accion" ? "Gestor de Contratos" : currentMode.label}
          </p>
        </div>
        {selectedRole && (
          <div className="hidden lg:flex items-center gap-1.5 rounded-md border border-gold/40 bg-gold/5 px-2 py-1 text-[11px] text-gold">
            <ShieldCheck className="h-3 w-3" />
            <span className="max-w-[160px] truncate">Defiendo a: {selectedRole}</span>
            <button onClick={() => setSelectedRole(null)} className="ml-1 text-muted-foreground hover:text-destructive" title="Cambiar rol">
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
        <div className="hidden md:flex items-center gap-1 rounded-md border border-border/60 bg-background/60 px-1 py-1">
          {MODES.map((m) => {
            const Icon = m.icon;
            const active = m.id === mode;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                title={m.description}
                className={cn(
                  "flex items-center gap-1.5 rounded px-2.5 py-1 text-xs transition-colors",
                  active
                    ? "bg-gradient-gold text-primary-foreground shadow-glow"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {m.label.replace("Modo ", "")}
              </button>
            );
          })}
        </div>
      </header>

      {/* Messages */}
      <ScrollArea className="flex-1">
        <div ref={scrollRef} className="mx-auto max-w-3xl px-4 lg:px-6 py-8 space-y-6">
          {messages.length === 0 && (
            chatType === "accion"
              ? <AccionEmptyState subtype={accionSubtype} onFileClick={() => fileInputRef.current?.click()} />
              : <EmptyState mode={mode} setMode={setMode} />
          )}
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
          {busy && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-gold" />
              Legateck está analizando...
            </div>
          )}
          {!busy && !redline && messages.some((m) => m.role === "assistant" && ((m.parts as any[]) ?? []).some((p) => p.type === "text" && /nueva versión de este contrato completamente corregida/i.test(p.text))) && (
            <div className="rounded-xl border border-gold/50 bg-gradient-to-br from-card to-card/40 p-5 shadow-elegant">
              <div className="flex items-start gap-3">
                <Sparkles className="h-5 w-5 text-gold mt-0.5" />
                <div className="flex-1">
                  <div className="font-semibold text-sm">Genera la versión blindada</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Reescribiré el contrato con cláusulas que te protegen, en formato de control de cambios.
                  </p>
                </div>
                <Button
                  size="sm"
                  className="bg-gradient-gold text-primary-foreground"
                  onClick={() => {
                    if (noCredits) { setUpgradeOpen(true); return; }
                    redlineMut.mutate();
                  }}
                  disabled={redlineMut.isPending}
                >
                  {redlineMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Generar versión corregida"}
                </Button>
              </div>
            </div>
          )}
          {redline && (
            <RedlineViewer
              redlineId={redline.id}
              preview={redline.preview}
              onUpgradeNeeded={() => setUpgradeOpen(true)}
              onUnlocked={() => qc.invalidateQueries({ queryKey: ["credits"] })}
            />
          )}
          {partiesMut.isPending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-gold" />
              Identificando las partes del contrato...
            </div>
          )}
          {parties && !selectedRole && (
            <PartyPicker
              partyA={parties.partyA!}
              partyB={parties.partyB!}
              onChoose={chooseRole}
            />
          )}
        </div>
      </ScrollArea>
      {!TRIAL_MODE && <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} />}

      {/* Composer */}
      <div className="border-t border-border/50 bg-card/40 p-4">
        <div className="mx-auto max-w-3xl">
          {attachments.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {attachments.map((a, i) => (
                <div key={i} className="flex items-center gap-2 rounded-md border border-border/60 bg-background px-3 py-1.5 text-xs">
                  <FileText className="h-3.5 w-3.5 text-gold" />
                  <span className="max-w-[200px] truncate">{a.filename}</span>
                  <button
                    onClick={() => setAttachments((arr) => arr.filter((_, idx) => idx !== i))}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="relative">
            <form onSubmit={submit} className={cn(
              "relative rounded-xl border border-border/60 bg-background shadow-elegant focus-within:border-gold/60 transition-colors",
              noCredits && "opacity-40 pointer-events-none select-none blur-[1px]",
            )}>
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder={`Consulte en ${currentMode.label}...`}
                rows={2}
                disabled={noCredits}
                className="min-h-[60px] resize-none border-0 bg-transparent focus-visible:ring-0 pr-28 pb-12"
              />
              <div className="absolute bottom-2 left-2 flex items-center gap-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,text/plain,image/png,image/jpeg"
                  className="hidden"
                  onChange={(e) => onPickFiles(e.target.files)}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || noCredits}
                  className="h-8 text-muted-foreground hover:text-gold"
                >
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                  <span className="ml-1.5 text-xs">PDF · Word · TXT · Imagen</span>
                </Button>
              </div>
              <div className="absolute bottom-2 right-2">
                <Button type="submit" size="sm" disabled={busy || noCredits || (!input.trim() && attachments.length === 0)} className="h-8 bg-gradient-gold text-primary-foreground hover:opacity-95">
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </div>
            </form>

            {noCredits && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="pointer-events-auto flex items-center gap-4 rounded-xl border border-gold/60 bg-card/95 backdrop-blur px-5 py-3 shadow-elegant max-w-[520px]">
                  <div className="h-9 w-9 rounded-md bg-gradient-gold flex items-center justify-center shadow-glow shrink-0">
                    <Lock className="h-4 w-4 text-primary-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">Sin créditos disponibles</div>
                    <p className="text-xs text-muted-foreground leading-snug">
                      Adquiera un Pase Único o active un plan para continuar consultando.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => setUpgradeOpen(true)}
                    className="bg-gradient-gold text-primary-foreground hover:opacity-95 shrink-0"
                  >
                    Hacer Upgrade
                  </Button>
                </div>
              </div>
            )}
          </div>
          <p className="mt-2 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
            Legateck puede cometer errores. Verifique referencias legales clave.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pantalla inicial para hilos de ACCIONES
// ─────────────────────────────────────────────────────────────────────────────
function AccionEmptyState({
  subtype,
  onFileClick,
}: {
  subtype: "generar" | "revisar" | null;
  onFileClick: () => void;
}) {
  if (subtype === "revisar") {
    return (
      <div className="text-center py-12 space-y-6">
        <div className="mx-auto h-12 w-12 rounded-full bg-gradient-gold flex items-center justify-center shadow-glow">
          <FileEdit className="h-6 w-6 text-primary-foreground" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold tracking-tight">Revisar / Editar contrato</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Adjunte el contrato a revisar (PDF, Word o TXT) y describa qué aspectos desea auditar o mejorar.
            La IA analizará cada cláusula bajo las leyes de la República de Panamá.
          </p>
        </div>
        <Button
          type="button"
          onClick={onFileClick}
          className="bg-gradient-gold text-primary-foreground hover:opacity-95 shadow-glow"
        >
          <Paperclip className="h-4 w-4 mr-2" />
          Cargar contrato
        </Button>
        <p className="text-xs text-muted-foreground">Soporta PDF · Word · TXT · Imagen</p>
      </div>
    );
  }

  // subtype === "generar" o null
  return (
    <div className="text-center py-12 space-y-6">
      <div className="mx-auto h-12 w-12 rounded-full bg-gradient-gold flex items-center justify-center shadow-glow">
        <FilePlus2 className="h-6 w-6 text-primary-foreground" />
      </div>
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">Generar contrato nuevo</h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Describa el tipo de contrato que necesita, las partes involucradas y las condiciones
          principales. La IA redactará cada cláusula bajo el Código Civil, Comercial y laboral
          de Panamá.
        </p>
      </div>
      <div className="grid sm:grid-cols-2 gap-3 max-w-lg mx-auto text-left">
        {[
          { label: "Tipo de contrato", example: "Ej: Contrato de arrendamiento, NDA, servicios..." },
          { label: "Partes involucradas", example: "Ej: Empresa X (arrendador) y Juan Pérez (arrendatario)" },
          { label: "Condiciones clave", example: "Ej: Monto, plazo, penalidades, exclusividad..." },
          { label: "Jurisdicción", example: "Ej: Ciudad de Panamá, República de Panamá" },
        ].map((tip) => (
          <div key={tip.label} className="rounded-lg border border-border/60 bg-card/40 p-3">
            <div className="text-xs font-semibold mb-0.5">{tip.label}</div>
            <div className="text-xs text-muted-foreground">{tip.example}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ mode, setMode }: { mode: AnalysisMode; setMode: (m: AnalysisMode) => void }) {
  return (
    <div className="text-center py-12 space-y-8">
      <div className="space-y-4">
        <div className="mx-auto h-12 w-12 rounded-full bg-gradient-gold flex items-center justify-center shadow-glow">
          <Scale className="h-6 w-6 text-primary-foreground" />
        </div>
        <h2 className="text-xl font-semibold tracking-tight">¿En qué puedo asistirle hoy?</h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Elija el modo de análisis que mejor se adapte a su consulta.
        </p>
      </div>

      <div className="grid sm:grid-cols-3 gap-3 max-w-2xl mx-auto">
        {MODES.map((m) => {
          const Icon = m.icon;
          const active = m.id === mode;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={cn(
                "group flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all",
                active
                  ? "border-gold/70 bg-gradient-to-br from-card to-card/40 shadow-elegant"
                  : "border-border/60 bg-card/40 hover:border-border hover:bg-card",
              )}
            >
              <div
                className={cn(
                  "h-9 w-9 rounded-md flex items-center justify-center transition-colors",
                  active ? "bg-gradient-gold shadow-glow" : "bg-muted text-muted-foreground group-hover:text-foreground",
                )}
              >
                <Icon className={cn("h-4 w-4", active && "text-primary-foreground")} />
              </div>
              <div className="font-medium text-sm">{m.label}</div>
              <p className="text-xs text-muted-foreground leading-relaxed">{m.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex gap-3", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="h-7 w-7 shrink-0 rounded-md bg-gradient-gold flex items-center justify-center mt-1">
          <Scale className="h-3.5 w-3.5 text-primary-foreground" />
        </div>
      )}
      <div className={cn("max-w-[85%] space-y-2", isUser && "items-end flex flex-col")}>
        {((message.parts as any[]) ?? []).map((part, i) => {
          if (part.type === "text") {
            return (
              <div
                key={i}
                className={cn(
                  "whitespace-pre-wrap text-[15px] leading-relaxed",
                  isUser
                    ? "rounded-2xl rounded-br-sm bg-primary text-primary-foreground px-4 py-2.5"
                    : "text-foreground",
                )}
              >
                {part.text}
              </div>
            );
          }
          if (part.type === "file") {
            return (
              <div key={i} className="flex items-center gap-2 rounded-md border border-border/60 bg-card px-3 py-2 text-xs">
                <FileText className="h-3.5 w-3.5 text-gold" />
                <span className="truncate max-w-[240px]">{part.filename ?? "documento"}</span>
              </div>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}

function PartyPicker({
  partyA,
  partyB,
  onChoose,
}: {
  partyA: string;
  partyB: string;
  onChoose: (role: string) => void;
}) {
  const options = [
    { label: partyA, role: partyA, icon: UserCheck, accent: "from-card to-card/40" },
    { label: partyB, role: partyB, icon: UserCheck, accent: "from-card to-card/40" },
    { label: "Posición Imparcial / Neutral", role: "Posición imparcial y neutral, sin favorecer a ninguna parte", icon: ScaleIcon, accent: "from-card to-card/40" },
  ];
  return (
    <div className="rounded-xl border border-gold/50 bg-gradient-to-br from-card to-card/40 p-5 shadow-elegant">
      <div className="flex items-start gap-3 mb-4">
        <ShieldCheck className="h-5 w-5 text-gold mt-0.5" />
        <div>
          <div className="font-semibold text-sm">¿A quién representas en este contrato?</div>
          <p className="text-xs text-muted-foreground mt-1">
            Identificamos las partes. Elige una para que blindemos sus intereses durante todo el análisis.
          </p>
        </div>
      </div>
      <div className="grid sm:grid-cols-3 gap-2">
        {options.map((o, i) => {
          const Icon = o.icon;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onChoose(o.role)}
              className="group flex items-start gap-2 rounded-lg border border-border/60 bg-background/60 p-3 text-left text-sm transition-all hover:border-gold/70 hover:bg-gradient-to-br hover:from-card hover:to-card/40 hover:shadow-elegant"
            >
              <div className="h-7 w-7 shrink-0 rounded-md bg-muted group-hover:bg-gradient-gold flex items-center justify-center transition-colors">
                <Icon className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary-foreground" />
              </div>
              <span className="font-medium leading-tight">{o.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
