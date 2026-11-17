-- Rate limit de los endpoints públicos que crean leads (intake, contacto, RSVP).
-- Sólo objetos nuevos: sin DROP ni cambios destructivos.
--
-- Antes no había ninguno (TODO en api/intake/[publicId]/submit): cualquiera
-- podía crear leads en bucle, disparar notificaciones, secuencias y el análisis
-- de fit con IA, que se paga. agent_rate_limits no sirve: está atada por FK a
-- agent_tokens.
--
-- Ventana fija por (clave, bucket). La clave la arma el servidor y nunca lleva
-- la IP en claro: es un hash (ver src/lib/security/public-rate-limit.ts).
-- Sólo service_role toca la tabla y la función.

create table if not exists public.public_rate_limits (
  key           text        not null,
  bucket        text        not null,
  window_start  timestamptz not null,
  count         int         not null default 0,
  primary key (key, bucket, window_start)
);

-- Para la purga por antigüedad.
create index if not exists public_rate_limits_window_start_idx
  on public.public_rate_limits (window_start);

alter table public.public_rate_limits enable row level security;
-- Sin policies: authenticated tiene SELECT por la regla de grants del repo,
-- pero RLS no le devuelve ninguna fila. Escribe sólo el servidor.
revoke all on public.public_rate_limits from anon;
grant select on public.public_rate_limits to authenticated;
grant select, insert, update, delete on public.public_rate_limits to service_role;

create or replace function public.public_rate_limit(
  p_key      text,
  p_bucket   text,
  p_limit    int,
  p_window_s int default 60
) returns table (allowed boolean, remaining int, reset_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(
    floor(extract(epoch from now()) / p_window_s) * p_window_s);
  v_count int;
begin
  insert into public.public_rate_limits as rl (key, bucket, window_start, count)
  values (p_key, p_bucket, v_window, 1)
  on conflict (key, bucket, window_start)
    do update set count = rl.count + 1
  returning rl.count into v_count;

  -- Purga incremental: ~1 de cada 50 llamadas borra ventanas de más de una
  -- hora. Sin cron propio y sin que la tabla crezca sin límite.
  if random() < 0.02 then
    delete from public.public_rate_limits where window_start < now() - interval '1 hour';
  end if;

  return query select
    v_count <= p_limit,
    greatest(p_limit - v_count, 0),
    v_window + make_interval(secs => p_window_s);
end;
$$;

revoke all on function public.public_rate_limit(text, text, int, int) from public, anon, authenticated;
grant execute on function public.public_rate_limit(text, text, int, int) to service_role;
