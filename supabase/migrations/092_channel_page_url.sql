-- 092 · El link de la página de una fuente vive en metadata.page_url.
--
-- Un tenant administrado por ITMANO no usa el constructor: su página la conecta
-- el equipo fuera del CRM, así que la fuente necesita un sitio donde guardar ese
-- link. Lo mismo vale para quien ya tenía su landing propia.
--
-- Hasta ahora ese dato caía en metadata.lp_url, que sólo escribía el modal de
-- creación de lead magnets y que no leía NADIE — quedaba guardado y nunca se
-- volvía a ver. Se unifica en page_url, que sí se muestra y se abre desde la
-- tarjeta de la fuente, y sirve para los tres tipos de canal.

update acquisition_channels
set metadata = (metadata - 'lp_url') || jsonb_build_object('page_url', metadata -> 'lp_url')
where metadata ? 'lp_url'
  and metadata ->> 'lp_url' is not null
  and not (metadata ? 'page_url');

-- Las filas que sólo tenían lp_url en null no aportan nada: se limpia la clave.
update acquisition_channels
set metadata = metadata - 'lp_url'
where metadata ? 'lp_url';
