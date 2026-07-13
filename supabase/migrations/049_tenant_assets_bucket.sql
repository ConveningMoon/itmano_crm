-- 049 · Bucket público para branding por tenant (logos).
--
-- Los logos se muestran en el sidebar del CRM y se configuran al crear el
-- tenant (super_admin) o desde Configuración → Perfil del equipo (agent_owner).
-- Mismo modelo que `property-media` (045): bucket público → lectura por URL
-- pública sin políticas RLS sobre storage.objects; las escrituras pasan solo
-- por el service-role client en server actions, así que no se necesitan
-- políticas de insert/update/delete.
--
-- Estructura de carpetas: <tenant_id>/logo-<uuid>.<ext>

INSERT INTO storage.buckets (id, name, public)
VALUES ('tenant-assets', 'tenant-assets', true)
ON CONFLICT (id) DO NOTHING;
