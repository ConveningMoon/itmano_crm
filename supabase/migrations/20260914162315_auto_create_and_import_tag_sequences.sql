-- Las secuencias obligatorias por etiqueta son infraestructura del catálogo:
-- deben existir antes de que alguien redacte o importe contenido.

create or replace function public.ensure_tag_email_sequences(p_tenant_id text)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  inserted_count integer;
begin
  with tenant_languages as (
    select distinct language
    from (
      select unnest(
        case
          when a.languages is null or cardinality(a.languages) = 0
            then array[a.language]
          else a.languages
        end
      ) as language
      from public.agents a
      where a.tenant_id = p_tenant_id
        and a.active = true
    ) available
    where language = any (array['es', 'en', 'pt'])
  ), effective_languages as (
    select language from tenant_languages
    union all
    select 'es' where not exists (select 1 from tenant_languages)
  )
  insert into public.email_sequences (
    tenant_id, name, language, description, activation_type,
    trigger_tag_id, agent_id, active
  )
  select
    t.tenant_id,
    t.name || ' · ' || upper(l.language),
    l.language,
    'Correo automático de la etiqueta "' || t.name || '".',
    'tag',
    t.id,
    null,
    true
  from public.lead_tags t
  cross join effective_languages l
  where t.tenant_id = p_tenant_id
    and t.requires_sequence = true
  on conflict (tenant_id, trigger_tag_id, language)
    where trigger_tag_id is not null
  do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

comment on function public.ensure_tag_email_sequences(text) is
  'Crea las secuencias vacías que falten para cada etiqueta obligatoria e idioma atendido.';

revoke all on function public.ensure_tag_email_sequences(text) from public, anon, authenticated;
grant execute on function public.ensure_tag_email_sequences(text) to service_role;

create or replace function public.ensure_tag_email_sequences_from_tag()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.requires_sequence then
    perform public.ensure_tag_email_sequences(new.tenant_id);
  end if;
  return new;
end;
$$;

revoke all on function public.ensure_tag_email_sequences_from_tag() from public, anon, authenticated;

drop trigger if exists ensure_tag_email_sequences_after_tag on public.lead_tags;
create trigger ensure_tag_email_sequences_after_tag
after insert or update of requires_sequence on public.lead_tags
for each row execute function public.ensure_tag_email_sequences_from_tag();

create or replace function public.ensure_tag_email_sequences_from_agent()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform public.ensure_tag_email_sequences(new.tenant_id);
  return new;
end;
$$;

revoke all on function public.ensure_tag_email_sequences_from_agent() from public, anon, authenticated;

drop trigger if exists ensure_tag_email_sequences_after_agent on public.agents;
create trigger ensure_tag_email_sequences_after_agent
after insert or update of language, languages, active on public.agents
for each row execute function public.ensure_tag_email_sequences_from_agent();

-- Backfill para todos los tenants existentes.
select public.ensure_tag_email_sequences(tenant_id)
from (
  select distinct tenant_id
  from public.lead_tags
  where requires_sequence = true
) tenants;

create or replace function public.import_all_tag_sequence_steps(
  p_tenant_id text,
  p_sequences jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item jsonb;
  sequence_id uuid;
  item_result jsonb;
  results jsonb := '[]'::jsonb;
  seen_keys text[] := array[]::text[];
  item_key text;
begin
  if jsonb_typeof(p_sequences) <> 'array' then
    raise exception 'p_sequences debe ser una lista';
  end if;

  perform public.ensure_tag_email_sequences(p_tenant_id);

  for item in select value from jsonb_array_elements(p_sequences)
  loop
    item_key := (item->>'tag_slug') || '|' || (item->>'language');
    if item_key = any (seen_keys) then
      raise exception 'La combinación % está repetida', item_key;
    end if;
    seen_keys := array_append(seen_keys, item_key);

    sequence_id := null;
    select s.id
      into sequence_id
    from public.email_sequences s
    join public.lead_tags t
      on t.id = s.trigger_tag_id
     and t.tenant_id = s.tenant_id
    where s.tenant_id = p_tenant_id
      and s.activation_type = 'tag'
      and t.requires_sequence = true
      and t.slug = item->>'tag_slug'
      and s.language = item->>'language';

    if sequence_id is null then
      raise exception 'No existe una secuencia obligatoria para %', item_key;
    end if;

    item_result := public.import_tag_sequence_steps(
      sequence_id,
      p_tenant_id,
      item->'emails'
    );

    results := results || jsonb_build_array(
      jsonb_build_object(
        'tag_slug', item->>'tag_slug',
        'language', item->>'language',
        'imported', item_result->'imported',
        'skipped', item_result->'skipped',
        'reordered', item_result->'reordered'
      )
    );
  end loop;

  return jsonb_build_object('sequences', results);
end;
$$;

comment on function public.import_all_tag_sequence_steps(text, jsonb) is
  'Importa en una transacción los correos de todas las combinaciones etiqueta/idioma del tenant.';

revoke all on function public.import_all_tag_sequence_steps(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.import_all_tag_sequence_steps(text, jsonb)
  to service_role;
