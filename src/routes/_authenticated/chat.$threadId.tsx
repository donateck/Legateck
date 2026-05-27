import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getThreadMessages } from "@/lib/threads.functions";
import { ChatWindow } from "@/components/chat-window";

export const Route = createFileRoute("/_authenticated/chat/$threadId")({
  component: ChatPage,
});

function ChatPage() {
  const { threadId } = useParams({ from: "/_authenticated/chat/$threadId" });
  const fetchMessages = useServerFn(getThreadMessages);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["thread", threadId],
    queryFn: () => fetchMessages({ data: { threadId } }),
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        Cargando consulta...
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Consulta no encontrada.
      </div>
    );
  }

  const chatType: "consulta" | "accion" =
    (data.thread as any).chat_type === "accion" ? "accion" : "consulta";

  return (
    <ChatWindow
      key={threadId}
      threadId={threadId}
      title={data.thread.title}
      chatType={chatType}
      initialMessages={(data.messages as any[]).map((m) => ({
        id: m.id,
        role: m.role,
        parts: m.parts,
      }))}
      onTitleMaybeChanged={() => qc.invalidateQueries({ queryKey: ["threads"] })}
    />
  );
}
