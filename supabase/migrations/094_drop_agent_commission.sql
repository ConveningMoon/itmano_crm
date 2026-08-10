-- 094 — Revierte la comisión por agente (090).
--
-- La 090 modelaba mal el negocio. Guardaba la comisión del agente como una tasa
-- ALTERNATIVA sobre el precio del inmueble, cuando en una inmobiliaria lo que
-- el agente negocia es su SPLIT de lo que factura la agencia: si la agencia
-- cobra el 10%, el agente no cobra el 15%, cobra ~el 80% de ese 10%. El campo
-- decía "comisión" y guardaba dos magnitudes distintas según la fila.
--
-- Y modelarlo bien tampoco valía la pena: un split es un multiplicador
-- constante, así que dentro de la cartera de un agente —el único conjunto que
-- ese agente compara— no cambia el orden de nada. Sólo cambiaría la comparación
-- ENTRE agentes, que es la vista del propietario, a quien le importa lo que
-- factura la agencia, no lo que se lleva cada uno. Cero decisiones distintas a
-- cambio de una pantalla de configuración y de convertir `agents` en una tabla
-- con datos de compensación, que es una categoría de fuga que este CRM hoy no
-- tiene.
--
-- Queda una sola comisión, la del tenant (086), y la ficha del lead dice de
-- quién es esa cifra en vez de insinuar que es del agente.
--
-- Sin pérdida de datos reales: al aplicarla, la única fila con valores era
-- 'agent-test-agent' (15/15), dato de prueba. Los cinco agentes reales estaban
-- en null — la 090 nunca llegó a usarse en producción.
alter table agents drop column if exists commission_model;
alter table agents drop column if exists commission_buy;
alter table agents drop column if exists commission_sell;
