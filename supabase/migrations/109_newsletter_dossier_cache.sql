-- 109 · Caché del dossier de investigación de newsletters.
--
-- El paso 1 de la generación con IA (research.ts: búsqueda web restringida a la
-- allowlist del tenant) es el caro: entre $0,50 y $0,90 por generación, contra
-- un presupuesto Growth de $30/mes compartido con TODA la IA del tenant. El
-- paso 2 (redacción) cuesta una fracción de eso.
--
-- Ese gasto se repite entero cada vez que alguien pide el MISMO tema: publicar
-- la edición en dos idiomas, reintentar tras un fallo de redacción, o
-- simplemente no quedar conforme con el texto y volver a generar. Los datos de
-- mercado del mes no cambiaron entre un intento y otro; la factura sí.
--
-- SÓLO se cachea cuando el tenant escribió un tema explícito. Cuando deja que
-- la IA proponga ("elige tú el tema más útil"), reutilizar el dossier
-- devolvería una y otra vez la misma edición — que es justo lo contrario de lo
-- que se está pidiendo. Ese caso no toca esta tabla ni para leer ni para
-- escribir; el gate vive en el código (dossier-cache.ts).

create table if not exists public.newsletter_dossiers (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   text not null references public.tenants(id) on delete cascade,

  -- Tema NORMALIZADO (minúsculas, sin acentos, sin puntuación, espacios
  -- colapsados). Es la llave: "Mercado de Virginia Beach" y "mercado de
  -- virginia beach" son la misma petición.
  topic_key   text not null,

  -- El idioma va en la llave, no fuera: el dossier viene redactado en el idioma
  -- que se pidió (claims y resumen incluidos), así que servir el dossier
  -- español a una edición en inglés le daría al redactor material en el idioma
  -- equivocado.
  language    text not null,

  -- Ventana de validez: 'YYYY-MM'. Un dossier de mercado inmobiliario envejece
  -- en semanas, no en horas; el mes natural es el grano que coincide con cómo
  -- se publican los datos que cita (informes mensuales de NAR, Redfin, FRED).
  period      text not null,

  -- El dossier tal cual lo devolvió research.ts.
  topic       text not null,
  summary     text not null,
  findings    jsonb not null default '[]'::jsonb,

  -- La allowlist con la que se investigó. NO forma parte de la llave: se
  -- compara al leer, y si el tenant cambió sus fuentes el dossier deja de
  -- servir — reutilizarlo citaría dominios que ya no están autorizados.
  domains     text[] not null default '{}',

  -- Cuántas búsquedas costó producirlo. Es lo que el acierto de caché ahorra,
  -- y lo único que permite medir si esta tabla vale la pena.
  searches    integer not null default 0,

  created_at  timestamptz not null default now()
);

create unique index if not exists newsletter_dossiers_key_idx
  on public.newsletter_dossiers (tenant_id, topic_key, language, period);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Misma forma que newsletter_editions (105): una policy por operación, con
-- `is_super_admin() or tenant_id = get_my_tenant_id()`.
--
-- Sin policy para `anon`: esto es material de trabajo interno, no contenido
-- publicable. Lo que sale a la web son las ediciones.
alter table public.newsletter_dossiers enable row level security;

create policy "newsletter_dossiers_select" on public.newsletter_dossiers
  for select using (is_super_admin() or (tenant_id = get_my_tenant_id()));

create policy "newsletter_dossiers_insert" on public.newsletter_dossiers
  for insert with check (is_super_admin() or (tenant_id = get_my_tenant_id()));

create policy "newsletter_dossiers_update" on public.newsletter_dossiers
  for update
  using (is_super_admin() or (tenant_id = get_my_tenant_id()))
  with check (is_super_admin() or (tenant_id = get_my_tenant_id()));

create policy "newsletter_dossiers_delete" on public.newsletter_dossiers
  for delete using (is_super_admin() or (tenant_id = get_my_tenant_id()));

revoke all on public.newsletter_dossiers from anon;
grant select, insert, update, delete on public.newsletter_dossiers to authenticated, service_role;

comment on table public.newsletter_dossiers is
  'Caché del paso de investigación de newsletters con IA, por (tenant, tema
   normalizado, idioma, mes). Sólo se escribe cuando el tenant pidió un tema
   explícito: con tema propuesto por la IA, reutilizar produciría la misma
   edición una y otra vez.';
