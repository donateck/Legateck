import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";

import appCss from "../styles.css?url";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Legateck — Inteligencia legal para abogados en Panamá" },
      { name: "description", content: "Plataforma premium de auditoría documental e IA legal para abogados en la República de Panamá." },
      { property: "og:title", content: "Legateck — Inteligencia legal para abogados en Panamá" },
      { name: "twitter:title", content: "Legateck — Inteligencia legal para abogados en Panamá" },
      { property: "og:description", content: "Plataforma premium de auditoría documental e IA legal para abogados en la República de Panamá." },
      { name: "twitter:description", content: "Plataforma premium de auditoría documental e IA legal para abogados en la República de Panamá." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/cfc40dd6-14c0-4353-b543-941c58f21c54/id-preview-0d2dcdb7--6fe45bbe-a40a-4232-a693-92c804ef9a36.lovable.app-1779213215473.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/cfc40dd6-14c0-4353-b543-941c58f21c54/id-preview-0d2dcdb7--6fe45bbe-a40a-4232-a693-92c804ef9a36.lovable.app-1779213215473.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="dark">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function AuthSync() {
  const router = useRouter();
  const qc = useQueryClient();
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      router.invalidate();
      qc.invalidateQueries();
    });
    return () => subscription.unsubscribe();
  }, [router, qc]);
  return null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthSync />
      <Outlet />
      <Toaster richColors theme="dark" position="top-right" />
    </QueryClientProvider>
  );
}
