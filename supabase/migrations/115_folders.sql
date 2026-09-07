-- 115 · Carpetas para organizar fuentes y secuencias de email.
--
-- Son PERSONALES, no del tenant: cada usuario arma su propia organización y la
-- del propietario del equipo no se le impone al resto. Así dos personas pueden
-- ordenar el mismo catálogo de fuentes de forma distinta sin pisarse — que es
-- justo el conflicto que aparecería con carpetas compartidas.
--
-- Consecuencias del modelo:
--   · `owner_user_id` es parte de la identidad de la carpeta y de la pertenencia.
--   · Un elemento está en como mucho UNA carpeta POR USUARIO (índices únicos
--     parciales más abajo); para otro usuario puede estar en otra o en ninguna.
--   · Las carpetas no cambian visibilidad ni permisos: son una capa de vista.
--     Quién ve o escribe una fuente lo siguen decidiendo RLS y los guards.
--   · `kind` separa los dos catálogos: las carpetas de /sources no aparecen en
--     /emails y viceversa.

-- ── 1) Carpetas ──────────────────────────────────────────────────────────────

create table if not exists public.folders (
  id            uuid primary key default gen_random_uuid(),
  -- El tenant no es dueño de la carpeta, pero sí la acota: el super_admin
  -- trabaja actuando como un tenant a la vez y sus carpetas de un cliente no
  -- deben aparecer mientras opera otro.
  tenant_id     text not null references public.tenants(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  kind          text not null check (kind in ('source', 'sequence')),
  name          text not null check (char_length(btrim(name)) between 1 and 60),
  -- Orden manual dentro de la sección; empatan por created_at.
  position      integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.folders is
  'Carpetas personales para agrupar fuentes (kind=source) o secuencias de email
   (kind=sequence). Pertenecen a un usuario, no al tenant: cada quien organiza
   su propia vista. No otorgan ni restringen acceso a los elementos.';

-- Dos carpetas con el mismo nombre en la misma sección son un error de dedo,
-- no una intención. Se compara sin mayúsculas ni espacios de sobra.
create unique index if not exists folders_owner_kind_name_idx
  on public.folders (owner_user_id, tenant_id, kind, lower(btrim(name)));

-- La lectura de la página es siempre "mis carpetas de esta sección, en orden".
create index if not exists folders_owner_kind_position_idx
  on public.folders (owner_user_id, tenant_id, kind, position, created_at);

-- ── 2) Pertenencia ───────────────────────────────────────────────────────────
--
-- Dos FK anulables en vez de un `item_id` polimórfico: con una columna genérica
-- no habría integridad referencial y borrar una fuente dejaría filas huérfanas
-- apuntando a un uuid que ya no existe. Así el `on delete cascade` limpia solo.

create table if not exists public.folder_items (
  id            uuid primary key default gen_random_uuid(),
  folder_id     uuid not null references public.folders(id) on delete cascade,
  -- Redundante con folders.owner_user_id, y a propósito: es lo que permite el
  -- índice único "un elemento, una carpeta por usuario" sin subconsultas.
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  channel_id    uuid references public.acquisition_channels(id) on delete cascade,
  sequence_id   uuid references public.email_sequences(id) on delete cascade,
  created_at    timestamptz not null default now(),
  constraint folder_items_one_target check (num_nonnulls(channel_id, sequence_id) = 1)
);

comment on table public.folder_items is
  'Qué elemento está en qué carpeta, para un usuario. Exactamente una de
   channel_id / sequence_id está poblada.';

create unique index if not exists folder_items_owner_channel_idx
  on public.folder_items (owner_user_id, channel_id)
  where channel_id is not null;

create unique index if not exists folder_items_owner_sequence_idx
  on public.folder_items (owner_user_id, sequence_id)
  where sequence_id is not null;

-- FK indexadas: la lista agrupa por carpeta y los borrados en cascada de
-- fuentes y secuencias buscan por su columna.
create index if not exists folder_items_folder_idx
  on public.folder_items (folder_id);
create index if not exists folder_items_channel_idx
  on public.folder_items (channel_id) where channel_id is not null;
create index if not exists folder_items_sequence_idx
  on public.folder_items (sequence_id) where sequence_id is not null;

-- ── 3) RLS ───────────────────────────────────────────────────────────────────
--
-- Aquí NO va el `is_super_admin() or tenant_id = get_my_tenant_id()` del resto
-- del repo: eso haría que el super_admin viera —y pudiera borrar— las carpetas
-- personales de otras personas. Estas filas son de su dueño y de nadie más.
-- `(select auth.uid())` y no `auth.uid()`: envuelto en subconsulta se evalúa
-- una vez por consulta en lugar de una vez por fila.

alter table public.folders      enable row level security;
alter table public.folder_items enable row level security;

create policy "folders_select" on public.folders
  for select using (owner_user_id = (select auth.uid()));

create policy "folders_insert" on public.folders
  for insert with check (owner_user_id = (select auth.uid()));

create policy "folders_update" on public.folders
  for update
  using (owner_user_id = (select auth.uid()))
  with check (owner_user_id = (select auth.uid()));

create policy "folders_delete" on public.folders
  for delete using (owner_user_id = (select auth.uid()));

create policy "folder_items_select" on public.folder_items
  for select using (owner_user_id = (select auth.uid()));

create policy "folder_items_insert" on public.folder_items
  for insert with check (owner_user_id = (select auth.uid()));

create policy "folder_items_update" on public.folder_items
  for update
  using (owner_user_id = (select auth.uid()))
  with check (owner_user_id = (select auth.uid()));

create policy "folder_items_delete" on public.folder_items
  for delete using (owner_user_id = (select auth.uid()));

-- ── 4) Grants ────────────────────────────────────────────────────────────────
-- Nada para `anon`: las carpetas son de la app interna y no existen en ninguna
-- página pública.

revoke all on public.folders      from anon;
revoke all on public.folder_items from anon;

grant select, insert, update, delete on public.folders      to authenticated, service_role;
grant select, insert, update, delete on public.folder_items to authenticated, service_role;

-- ── 5) updated_at ────────────────────────────────────────────────────────────

create or replace function public.touch_folder()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists folders_touch on public.folders;
create trigger folders_touch
  before update on public.folders
  for each row execute function public.touch_folder();
