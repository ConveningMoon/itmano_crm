-- 059 · Normalización de agents.languages en escritura.
--
-- Bug de 058: el default array['es'] no sigue al idioma principal — un INSERT
-- con language='en' y sin languages violaba agents_languages_check
-- (language = any(languages)) y rompía cualquier seed/fixture (suite RLS).
--
-- Arreglo: sin default; un trigger BEFORE INSERT/UPDATE repara la coherencia
-- (languages vacío → [language]; principal ausente → se antepone). El check
-- de 058 queda como cinturón — el trigger garantiza que siempre pase.

alter table agents alter column languages drop default;

create or replace function normalize_agent_languages()
returns trigger
language plpgsql
as $$
begin
  if new.languages is null or array_length(new.languages, 1) is null then
    new.languages := array[new.language];
  elsif not (new.language = any (new.languages)) then
    new.languages := array[new.language] || new.languages;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_agents_normalize_languages on agents;
create trigger trg_agents_normalize_languages
  before insert or update of language, languages on agents
  for each row execute function normalize_agent_languages();
