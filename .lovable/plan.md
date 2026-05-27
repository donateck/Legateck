# Plan integral Legateck

Trabajo grande con DB, backend, UX y landing. Lo divido en 4 bloques.

---

## 1. Base de datos (migración Supabase)

**Nueva tabla `plans`** (catálogo estático sembrado):
- `id` text PK (`pase_unico`, `emprendedor`, `corporativo`, `ultra`)
- `name`, `price_usd` numeric, `credits_per_period` int (null = ilimitado), `period` text (`one_time` | `month`)

**Nueva tabla `user_credits`** (1 fila por usuario):
- `user_id` uuid PK → auth.users
- `plan_id` text → plans.id (default `pase_unico` con 0 créditos al registro, o null)
- `credits_remaining` int default 0
- `is_unlimited` bool default false
- `period_ends_at` timestamptz null
- `updated_at` timestamptz default now()
- RLS: select propio; updates solo vía service role (server functions).
- Trigger: al crearse `profiles`, insertar fila con 0 créditos.

**Nueva tabla `credit_transactions`** (audit):
- `id` uuid PK, `user_id` uuid, `delta` int, `reason` text (`consume_analysis`, `consume_redline`, `grant_plan`, `purchase_pass`), `thread_id` uuid null, `created_at` timestamptz.
- RLS: select propio.

**Campos nuevos en `threads`**:
- `locked_document_id` text null — hash/path del PDF original cuando es Pase Único.
- `locked_topic` text null — primer prompt resumido (para detectar cambio radical).
- `plan_at_creation` text null.

**Nueva tabla `contract_redlines`**:
- `id` uuid PK, `thread_id` uuid, `user_id` uuid
- `preview_markdown` text — versión con marcas `[[DEL]]...[[/DEL]]` y `[[ADD]]...[[/ADD]]`
- `clean_markdown` text — versión final limpia para descarga
- `paid` bool default false
- `created_at` timestamptz
- RLS: select/update propio.

## 2. Backend (server functions)

**`src/lib/credits.functions.ts`** (nuevo):
- `getMyCredits()` — devuelve `{plan, credits_remaining, is_unlimited, period_ends_at}`.
- `consumeCredit({ threadId, reason })` — server-only, valida saldo, decrementa, registra transacción. Devuelve `{ok, remaining}` o error `INSUFFICIENT_CREDITS`.
- `purchasePass({ planId })` — stub que asigna créditos (sin pasarela real todavía; deja TODO para Stripe/Paddle). Útil para QA.

**`src/lib/redline.functions.ts`** (nuevo):
- `generateRedlinePreview({ threadId })` — llama Claude con el último contrato analizado del hilo, devuelve markdown con marcas `[[DEL]]`/`[[ADD]]` + versión limpia. Guarda `contract_redlines` con `paid=false`. Devuelve solo preview enmascarado (texto envuelto en spans que el front renderiza con CSS no-seleccionable).
- `payAndUnlockRedline({ redlineId })` — verifica saldo, llama `consumeCredit('consume_redline')`, marca `paid=true`, devuelve clean_markdown + docx base64.
- Generación DOCX server-side con `docx` npm package.

**`src/routes/api/chat.ts`** — modificar:
- Antes de procesar: llamar a `consumeCredit('consume_analysis')` solo en el primer mensaje del hilo (cuando `thread.title === 'Nueva consulta'`). Si falla → respuesta 402.
- Si plan es `pase_unico` y el hilo ya tiene `locked_document_id`: rechazar nuevos archivos distintos o prompts con tema radicalmente diferente (heurística simple: si hay nuevo archivo y su hash difiere → bloquear con mensaje "Este pase está amarrado al documento original. Adquiere más créditos para una nueva consulta.").
- Actualizar prompt para imponer la estructura tripartita (Auditoría / Resumen Ejecutivo 3 riesgos / Cierre Comercial CTA exacto) y reglas de formato sobrio.

**Prompt nuevo (resumen)**:
- Prohibir asteriscos decorativos, líneas `---`, tablas markdown con `|`.
- Tono memorando ejecutivo. Negritas solo títulos/conceptos críticos.
- Cuando detecte análisis de contrato, terminar SIEMPRE con las 3 secciones obligatorias y el CTA literal.

## 3. Frontend / UX

**`src/components/credits-badge.tsx`** (nuevo): chip en sidebar con créditos restantes + botón "Upgrade".

**`src/components/upgrade-dialog.tsx`** (nuevo): modal con las 4 tarjetas de plan, botón "Adquirir" que llama `purchasePass` (stub).

**`src/components/chat-window.tsx`** — modificar:
- Hook `useQuery(['credits'])`.
- Deshabilitar input + dropzone si `credits_remaining===0 && !is_unlimited` → mostrar overlay con CTA Upgrade.
- Si hilo está locked (Pase Único con doc): mostrar banner "Hilo amarrado a [doc]. No puedes cambiar de tema."; bloquear nuevo archivo.
- Detectar en respuesta del assistant el marcador CTA "¿Deseas que genere una nueva versión...?" y renderizar botón "Generar versión corregida" → llama `generateRedlinePreview`.
- Vista redline: componente `<RedlineViewer>` con CSS `user-select:none`, blur parcial + watermark "VISTA PREVIA BLOQUEADA"; botón "Desbloquear (1 crédito)" → `payAndUnlockRedline` → habilita descarga `.docx`.

**`src/routes/_authenticated.tsx`** — añadir `<CreditsBadge />` al sidebar, deshabilitar botón "Nueva consulta" si saldo 0.

**`src/routes/_authenticated/planes.tsx`** (nuevo): página listado de los 4 planes.

## 4. Landing — "El Blindaje Legateck"

**`src/routes/index.tsx`** — añadir sección premium con dos tarjetas contrastadas:
- Tarjeta roja: "ChatGPT público — El peligro" (entrenamiento con tus datos, filtraciones).
- Tarjeta esmeralda: "Legateck — El blindaje" (API Anthropic comercial, SSL, no-train, datos efímeros).
- Visual: glassmorphism, iconos lucide `ShieldAlert` vs `ShieldCheck`, animación on-scroll suave.

---

## Detalles técnicos clave

- **Detección de "cambio de tema"** (pase único): comparar embedding-free → heurística por coincidencia de palabras clave del `locked_topic` con el nuevo prompt; umbral simple. No es perfecta pero suficiente.
- **Hash de documento**: SHA-256 del primer attachment al crear el hilo, guardado en `threads.locked_document_id`.
- **Protección anti-copy**: CSS `user-select:none`, `pointer-events:none` sobre texto, overlay con gradiente. No es seguridad real (DOM siempre inspeccionable) — el contenido limpio NO se envía al cliente hasta pagar; el preview viene con caracteres ofuscados parcialmente cada N palabras.
- **DOCX**: generar server-side con `docx` package, devolver como base64 en respuesta y trigger download en cliente.
- **Pago**: este plan NO integra Stripe/Paddle real. `purchasePass` es stub que añade créditos (para que el flujo funcione end-to-end). Cuando el usuario quiera pasarela real, se integra después con el tool `payments--recommend_payment_provider`.

## Orden de implementación

1. Migración DB (plans, user_credits, credit_transactions, contract_redlines, columnas en threads, trigger handle_new_user actualizado).
2. Server functions credits + redline + cambios en `/api/chat`.
3. Componentes credits-badge, upgrade-dialog, redline-viewer.
4. Cambios en chat-window y _authenticated.
5. Página /planes y sección Blindaje en landing.
6. Instalar `docx` package.

¿Procedo?
