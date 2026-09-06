-- 051 · Firma de correo por agente.
--
-- El composer de correos ya no edita la firma inline: se configura de forma
-- centralizada en Configuración → Email y se agrega automáticamente al final
-- de cada correo (secuencias, hitos de compra y envíos one-off). La firma es
-- del agente asignado al lead — texto libre multilínea, en tono personal
-- (p. ej. "Un abrazo,\nAdriana").

alter table agents
  add column if not exists email_signature text;
