-- 095 · Portada del agente.
--
-- Es dato del AGENTE, no del Estudio: la sube él mismo en Ajustes → Agentes
-- (requireSelfOrManager, igual que su descripción) y puede servir en otras
-- superficies. El Estudio la usa en los templates que tienen slot para ella, y
-- siempre es opcional: el agente puede no tener foto, y aunque la tenga el
-- diseño puede usarse sin ella.
--
-- cover_photo_cutout guarda si el archivo traía transparencia REAL (sharp:
-- stats().isOpaque === false — un canal alfa totalmente opaco no cuenta). Se
-- persiste en vez de recalcularse porque el compositor decide recorte-o-círculo
-- en CADA render y no vamos a descargar y analizar el archivo cada vez.
--
-- No se recorta con IA: Nano Banana no recorta, REGENERA. Devolvería una persona
-- redibujada que se parece a la agente, y eso en material que publica con su
-- nombre no es un recorte sino un retrato falso.

alter table agents
  add column if not exists cover_photo_url    text,
  add column if not exists cover_photo_cutout boolean not null default false;
