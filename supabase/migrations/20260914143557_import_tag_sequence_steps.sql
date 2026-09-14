-- Importa en una sola transacción correos redactados fuera del CRM para una
-- secuencia disparada por etiqueta. `send_at_hours` es tiempo absoluto desde
-- que se aplica la etiqueta; la tabla conserva delays relativos.

create or replace function public.import_tag_sequence_steps(
  p_sequence_id uuid,
  p_tenant_id text,
  p_steps jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_sequence_tenant text;
  v_activation_type text;
  v_has_runs boolean;
  v_existing_count integer := 0;
  v_imported integer := 0;
  v_last_existing_hour integer := 0;
  v_absolute_hour integer := 0;
  v_previous_hour integer := 0;
  v_temp_order integer := 0;
  v_target_order integer := 0;
  v_step jsonb;
  v_send_hour integer;
  v_subject text;
  v_body text;
  v_step_id uuid;
  v_ids uuid[] := array[]::uuid[];
  v_hours integer[] := array[]::integer[];
  v_positions integer[] := array[]::integer[];
  v_skipped jsonb := '[]'::jsonb;
  v_reordered boolean := false;
  v_row record;
begin
  if jsonb_typeof(p_steps) <> 'array' then
    raise exception 'p_steps debe ser un array JSON';
  end if;
  if jsonb_array_length(p_steps) < 1 or jsonb_array_length(p_steps) > 100 then
    raise exception 'La importación debe contener entre 1 y 100 emails';
  end if;

  -- Dos uploads simultáneos de la misma secuencia no pueden calcular el mismo
  -- horario. El lock vive sólo durante esta llamada/transacción.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_sequence_id::text, 0)
  );

  select tenant_id, activation_type
    into v_sequence_tenant, v_activation_type
  from public.email_sequences
  where id = p_sequence_id
  for update;

  if not found
     or v_sequence_tenant <> p_tenant_id
     or v_activation_type <> 'tag' then
    raise exception 'Secuencia por etiqueta no encontrada'
      using errcode = '42501';
  end if;

  select exists (
    select 1
    from public.lead_sequence_runs
    where sequence_id = p_sequence_id
  ) into v_has_runs;

  select coalesce(max(step_order), -1) + 1
    into v_temp_order
  from public.email_sequence_steps
  where sequence_id = p_sequence_id;

  for v_row in
    select id, delay_hours
    from public.email_sequence_steps
    where sequence_id = p_sequence_id
    order by step_order, id
  loop
    if v_row.delay_hours < 0 then
      raise exception 'La secuencia contiene un delay negativo; corrígelo antes de importar';
    end if;
    v_absolute_hour := v_absolute_hour + v_row.delay_hours;
    v_ids := array_append(v_ids, v_row.id);
    v_hours := array_append(v_hours, v_absolute_hour);
    v_positions := array_append(v_positions, v_existing_count);
    v_existing_count := v_existing_count + 1;
  end loop;
  v_last_existing_hour := v_absolute_hour;

  for v_step in
    select value
    from jsonb_array_elements(p_steps)
    order by (value ->> 'send_at_hours')::integer
  loop
    if jsonb_typeof(v_step) <> 'object'
       or coalesce(v_step ->> 'send_at_hours', '') !~ '^(0|[1-9][0-9]*)$' then
      raise exception 'Cada email necesita send_at_hours entero y no negativo';
    end if;

    v_send_hour := (v_step ->> 'send_at_hours')::integer;
    v_subject := btrim(coalesce(v_step ->> 'subject', ''));
    v_body := btrim(coalesce(v_step ->> 'body', ''));

    if v_send_hour > 8760
       or char_length(v_subject) not between 1 and 200
       or char_length(v_body) not between 1 and 8000 then
      raise exception 'Email fuera de los límites permitidos';
    end if;

    if v_send_hour = any(v_hours) then
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object(
        'send_at_hours', v_send_hour,
        'subject', v_subject,
        'reason', format('Ya existe un email programado para la hora %s.', v_send_hour)
      ));
      continue;
    end if;

    -- Cambiar step_order después de que la secuencia se usó rompería la
    -- correspondencia de runs y métricas históricas. En ese estado sólo es
    -- seguro anexar nuevos emails después del último existente.
    if v_has_runs and (v_existing_count = 0 or v_send_hour < v_last_existing_hour) then
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object(
        'send_at_hours', v_send_hour,
        'subject', v_subject,
        'reason', 'La secuencia ya tiene actividad; esta hora alteraría el orden histórico.'
      ));
      continue;
    end if;

    insert into public.email_sequence_steps (
      sequence_id,
      tenant_id,
      step_order,
      delay_hours,
      subject,
      body_json,
      body_html,
      resend_template_id,
      active
    ) values (
      p_sequence_id,
      p_tenant_id,
      v_temp_order + v_imported,
      v_send_hour,
      v_subject,
      jsonb_build_object('v', 1, 'body', v_body),
      null,
      null,
      true
    ) returning id into v_step_id;

    v_ids := array_append(v_ids, v_step_id);
    v_hours := array_append(v_hours, v_send_hour);
    v_positions := array_append(v_positions, v_existing_count + v_imported);
    v_imported := v_imported + 1;
    if v_existing_count > 0 and v_send_hour < v_last_existing_hour then
      v_reordered := true;
    end if;
  end loop;

  if v_imported > 0 then
    v_previous_hour := 0;
    v_target_order := 0;
    for v_row in
      select schedule.step_id, schedule.send_hour
      from unnest(v_ids, v_hours, v_positions) as schedule(step_id, send_hour, original_position)
      order by schedule.send_hour, schedule.original_position
    loop
      update public.email_sequence_steps
      set step_order = v_target_order,
          delay_hours = v_row.send_hour - v_previous_hour
      where id = v_row.step_id
        and sequence_id = p_sequence_id
        and tenant_id = p_tenant_id;

      v_previous_hour := v_row.send_hour;
      v_target_order := v_target_order + 1;
    end loop;
  end if;

  return jsonb_build_object(
    'imported', v_imported,
    'skipped', v_skipped,
    'reordered', v_reordered
  );
end;
$$;

comment on function public.import_tag_sequence_steps(uuid, text, jsonb) is
  'Importa y ordena emails por hora absoluta para una secuencia de etiqueta sin sobreescribir contenido existente.';

revoke all on function public.import_tag_sequence_steps(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.import_tag_sequence_steps(uuid, text, jsonb)
  to service_role;
