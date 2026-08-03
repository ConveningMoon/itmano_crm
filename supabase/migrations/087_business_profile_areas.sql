-- 087 — Las zonas que atiende la agencia.
--
-- `geo_fit` reparte +5 / 0 / −10 entre zona_principal, zona_secundaria y
-- fuera_de_zona desde la migración 077, y hasta ahora NADA definía cuáles son
-- esas zonas para cada agencia. Es el mismo fallo que tenía budget_tier: un
-- bucket que puntúa y que el sistema resolvía adivinando.
--
-- Nullable como el resto del perfil: sin zonas declaradas, geo_fit no se
-- clasifica y queda sin determinar — que es lo correcto cuando no se sabe, en
-- vez de castigar a un lead por una zona que nadie definió.
alter table public.tenants
  add column primary_areas   text[],
  add column secondary_areas text[];

comment on column public.tenants.primary_areas is
  'Zonas donde la agencia trabaja habitualmente → geo_fit = zona_principal.';
comment on column public.tenants.secondary_areas is
  'Zonas que atiende pero no son su foco → zona_secundaria. Fuera de ambas listas, fuera_de_zona.';
