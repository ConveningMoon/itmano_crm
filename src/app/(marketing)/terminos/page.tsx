import type { Metadata } from 'next'
import { LegalPage } from '@/components/marketing/legal-page'

export const metadata: Metadata = {
  title: 'Términos del servicio — ITMANO',
  description: 'Términos y condiciones de uso de la plataforma ITMANO CRM.',
}

export default function TerminosPage() {
  return (
    <LegalPage title="Términos del servicio" updated="14 de julio de 2026">
      <p>
        Estos términos regulan el acceso y uso de la plataforma ITMANO CRM (el
        «Servicio»), disponible en <strong>app.itmano.com</strong>. Al contratar o
        utilizar el Servicio aceptas estos términos en su totalidad.
      </p>

      <h2>1. Quiénes somos</h2>
      <p>
        El Servicio es operado por <strong>ITMANO TECHNOLOGY SERVICES AND CONSULTING
        - FZCO</strong>, sociedad constituida en Dubái, Emiratos Árabes Unidos, con
        licencia comercial N.º 55524 (en adelante, «ITMANO»). Contacto:{' '}
        <a href="mailto:customer@itmano.com">customer@itmano.com</a>.
      </p>

      <h2>2. Descripción del Servicio</h2>
      <p>
        ITMANO CRM es una plataforma de gestión de relaciones con clientes para
        equipos inmobiliarios que incluye, según el plan contratado: calificación
        automática de leads, pipeline en tiempo real, secuencias de email,
        gestión de propiedades, analytics y funciones asistidas por inteligencia
        artificial. Las funciones concretas de cada plan se describen en la
        propuesta comercial correspondiente.
      </p>

      <h2>3. Cuentas</h2>
      <p>
        Las cuentas se crean exclusivamente a través del equipo de ITMANO; no hay
        registro autoservicio. El acceso es mediante enlaces de un solo uso
        enviados al correo registrado (sin contraseñas). Eres responsable de
        mantener el control del buzón de correo asociado a tu cuenta y de la
        actividad realizada desde tus accesos.
      </p>

      <h2>4. Uso aceptable</h2>
      <ul>
        <li>No cargar datos de contactos obtenidos ilícitamente o sin base legal para su tratamiento.</li>
        <li>No usar el Servicio para enviar comunicaciones no solicitadas masivas (spam) ni contenido ilícito.</li>
        <li>No intentar acceder a datos de otros clientes, eludir controles de seguridad ni descompilar el software.</li>
        <li>No revender ni sublicenciar el acceso al Servicio sin acuerdo escrito con ITMANO.</li>
      </ul>
      <p>
        El incumplimiento grave o reiterado de esta sección faculta a ITMANO a
        suspender o terminar el Servicio.
      </p>

      <h2>5. Tus datos</h2>
      <p>
        Los datos que cargas al Servicio — leads, contactos, propiedades,
        comunicaciones — son y siguen siendo <strong>tuyos</strong>. ITMANO los trata
        únicamente para prestarte el Servicio, conforme a la{' '}
        <a href="/privacidad">Política de privacidad</a>. Al terminar el contrato
        puedes solicitar una exportación de tus datos durante los 30 días
        siguientes; transcurrido ese plazo podrán eliminarse de forma definitiva.
      </p>

      <h2>6. Propiedad intelectual</h2>
      <p>
        El software, el diseño, las marcas y todo el material del Servicio son
        propiedad de ITMANO o de sus licenciantes. La contratación otorga una
        licencia de uso limitada, no exclusiva e intransferible, vigente mientras
        dure la suscripción.
      </p>

      <h2>7. Inversión y facturación</h2>
      <p>
        El Servicio se contrata por suscripción mensual, facturada por adelantado.
        La inversión vigente de cada plan se comunica antes de contratar y puede
        actualizarse con un aviso mínimo de 30 días, aplicable a partir del
        siguiente ciclo. Los planes Partner se rigen por su propuesta comercial.
        Las condiciones de cancelación y reembolso se describen en la{' '}
        <a href="/reembolsos">Política de reembolsos</a>.
      </p>

      <h2>8. Funciones de inteligencia artificial</h2>
      <p>
        Algunas funciones generan contenido mediante modelos de IA (redacción de
        correos, generación de secuencias, extracción de datos de documentos).
        Este contenido es un borrador que requiere revisión humana: eres
        responsable de verificarlo antes de usarlo o enviarlo. ITMANO no
        garantiza la exactitud del contenido generado automáticamente.
      </p>

      <h2>9. Disponibilidad</h2>
      <p>
        ITMANO procura una disponibilidad continua del Servicio, pero este se
        presta «tal cual» y puede experimentar interrupciones por mantenimiento,
        fallas de terceros o causas de fuerza mayor. Los compromisos específicos
        de nivel de servicio, cuando existan, constan en el contrato del plan
        Partner.
      </p>

      <h2>10. Limitación de responsabilidad</h2>
      <p>
        En la máxima medida permitida por la ley aplicable, la responsabilidad
        total de ITMANO derivada del Servicio se limita al monto de la inversión
        efectivamente abonada por el cliente en los 12 meses anteriores al hecho
        que la origine. ITMANO no responde por lucro cesante, pérdida de negocio
        ni daños indirectos.
      </p>

      <h2>11. Terminación</h2>
      <p>
        Puedes cancelar tu suscripción en cualquier momento (ver{' '}
        <a href="/reembolsos">Política de reembolsos</a>). ITMANO puede terminar el
        contrato con aviso de 30 días, o de forma inmediata ante incumplimiento
        grave de estos términos.
      </p>

      <h2>12. Ley aplicable y jurisdicción</h2>
      <p>
        Estos términos se rigen por las leyes del Emirato de Dubái y las leyes
        federales aplicables de los Emiratos Árabes Unidos. Cualquier
        controversia se someterá a los tribunales competentes de Dubái, sin
        perjuicio de las protecciones imperativas que correspondan al cliente en
        su jurisdicción de residencia.
      </p>

      <h2>13. Cambios a estos términos</h2>
      <p>
        Podemos actualizar estos términos; los cambios materiales se notificarán
        con al menos 30 días de anticipación al correo de la cuenta. El uso del
        Servicio después de la fecha de entrada en vigor implica aceptación.
      </p>
    </LegalPage>
  )
}
