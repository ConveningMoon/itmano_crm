import type { Metadata } from 'next'
import { LegalPage } from '@/components/marketing/legal-page'

export const metadata: Metadata = {
  title: 'Política de reembolsos — ITMANO',
  description: 'Condiciones de cancelación y reembolso de las suscripciones a ITMANO CRM.',
}

export default function ReembolsosPage() {
  return (
    <LegalPage title="Política de reembolsos" updated="14 de julio de 2026">
      <p>
        Esta política aplica a las suscripciones de la plataforma ITMANO CRM y
        complementa los <a href="/terminos">Términos del servicio</a>.
      </p>

      <h2>1. Modelo de suscripción</h2>
      <p>
        El Servicio se factura por ciclos mensuales, por adelantado. La
        suscripción se renueva automáticamente al final de cada ciclo salvo
        cancelación previa.
      </p>

      <h2>2. Cancelación</h2>
      <p>
        Puedes cancelar en cualquier momento escribiendo a{' '}
        <a href="mailto:contacto@itmano.com">contacto@itmano.com</a> desde el
        correo asociado a tu cuenta. La cancelación es efectiva al final del
        ciclo en curso: conservas acceso completo hasta esa fecha y no se
        generan cargos posteriores.
      </p>

      <h2>3. Reembolsos</h2>
      <p>
        La inversión de un ciclo ya iniciado <strong>no es reembolsable</strong>, ni
        total ni proporcionalmente. No se emiten reembolsos por meses parciales,
        por baja utilización ni por funciones no usadas.
      </p>
      <p>Como excepciones, ITMANO sí emite reembolso o crédito en estos casos:</p>
      <ul>
        <li>
          <strong>Error de facturación</strong> — cargos duplicados o por un monto
          distinto al acordado se corrigen y reembolsan en su totalidad.
        </li>
        <li>
          <strong>Indisponibilidad prolongada</strong> — si el Servicio queda inaccesible
          por causa atribuible a ITMANO durante un período sustancial del ciclo,
          podremos aplicar un crédito proporcional al siguiente ciclo.
        </li>
      </ul>

      <h2>4. Plan Partner</h2>
      <p>
        Los planes Partner, por incluir servicios de configuración, migración de
        datos y acompañamiento dedicados, se rigen por las condiciones de
        cancelación y reembolso de su propuesta comercial específica.
      </p>

      <h2>5. Tus datos al terminar</h2>
      <p>
        Tras la fecha efectiva de cancelación dispones de 30 días para solicitar
        una exportación de tus datos (leads, contactos, propiedades).
        Transcurrido ese plazo, los datos podrán eliminarse de forma definitiva.
      </p>

      <h2>6. Cómo solicitar un reembolso</h2>
      <p>
        Escribe a <a href="mailto:contacto@itmano.com">contacto@itmano.com</a> con
        el nombre de tu cuenta, la fecha del cargo y el motivo. Respondemos en un
        máximo de 10 días hábiles; los reembolsos aprobados se emiten por el
        mismo medio de la transacción original.
      </p>
    </LegalPage>
  )
}
