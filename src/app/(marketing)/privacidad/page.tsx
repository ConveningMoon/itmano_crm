import type { Metadata } from 'next'
import { LegalPage } from '@/components/marketing/legal-page'

export const metadata: Metadata = {
  title: 'Política de privacidad — ITMANO',
  description: 'Cómo ITMANO recopila, usa y protege los datos personales en su plataforma CRM.',
}

export default function PrivacidadPage() {
  return (
    <LegalPage title="Política de privacidad" updated="14 de julio de 2026">
      <p>
        Esta política describe cómo <strong>ITMANO TECHNOLOGY SERVICES AND
        CONSULTING - FZCO</strong> («ITMANO»), con licencia comercial N.º 55524 y
        domicilio en Dubái, Emiratos Árabes Unidos, trata los
        datos personales en relación con la plataforma ITMANO CRM y este sitio
        web. Cumplimos la Ley Federal de Protección de Datos Personales de los
        EAU (Decreto-Ley Federal N.º 45 de 2021, «PDPL») y, cuando corresponde
        por la ubicación de nuestros clientes o de sus contactos, el RGPD de la
        Unión Europea y las leyes estatales de privacidad de Estados Unidos
        aplicables (como la CCPA).
      </p>

      <h2>1. Dos roles distintos</h2>
      <ul>
        <li>
          <strong>Responsable del tratamiento</strong> — para los datos de quienes
          visitan este sitio, nos escriben por el formulario de contacto o son
          usuarios de una cuenta ITMANO.
        </li>
        <li>
          <strong>Encargado del tratamiento (procesador)</strong> — para los datos de
          leads y contactos que nuestros clientes cargan a su CRM. Esos datos
          pertenecen al cliente; los tratamos solo según sus instrucciones y el
          contrato de servicio.
        </li>
      </ul>

      <h2>2. Qué datos tratamos</h2>
      <ul>
        <li>
          <strong>Formulario de contacto:</strong> nombre, email, empresa y el mensaje
          que nos envías. Los usamos exclusivamente para responder a tu solicitud.
        </li>
        <li>
          <strong>Usuarios de la plataforma:</strong> nombre, email, rol y registros de
          actividad necesarios para operar y proteger el Servicio.
        </li>
        <li>
          <strong>Datos cargados por los clientes al CRM:</strong> información de leads y
          contactos (nombre, email, teléfono, idioma, interacciones), propiedades
          y comunicaciones. El cliente es responsable de contar con base legal
          para tratarlos.
        </li>
      </ul>

      <h2>3. Para qué los usamos</h2>
      <ul>
        <li>Prestar, mantener y mejorar el Servicio (ejecución del contrato).</li>
        <li>Responder solicitudes comerciales o de soporte (interés legítimo / medidas precontractuales).</li>
        <li>Seguridad, prevención de fraude y cumplimiento legal.</li>
      </ul>
      <p>No vendemos datos personales ni los usamos para publicidad de terceros.</p>

      <h2>4. Subencargados</h2>
      <p>Usamos proveedores de infraestructura bajo acuerdos de tratamiento de datos:</p>
      <ul>
        <li><strong>Supabase</strong> — base de datos y autenticación.</li>
        <li><strong>Vercel</strong> — alojamiento de la aplicación.</li>
        <li><strong>Resend</strong> — envío y recepción de correos electrónicos.</li>
        <li><strong>Anthropic</strong> — funciones de inteligencia artificial.</li>
        <li><strong>Telegram</strong> — notificaciones operativas a los usuarios que las activan.</li>
      </ul>
      <p>
        Los datos enviados a los modelos de IA a través de la API de Anthropic no
        se utilizan para entrenar sus modelos, conforme a la política comercial
        de dicho proveedor.
      </p>

      <h2>5. Transferencias internacionales</h2>
      <p>
        Nuestros proveedores pueden alojar datos en Estados Unidos o la Unión
        Europea. Cuando se transfieren datos sujetos al RGPD o a la PDPL,
        aplicamos salvaguardas reconocidas, como cláusulas contractuales tipo.
      </p>

      <h2>6. Conservación</h2>
      <p>
        Conservamos los datos mientras la cuenta esté activa. Al terminar el
        contrato, el cliente dispone de 30 días para solicitar la exportación de
        sus datos; después podrán eliminarse definitivamente. Los mensajes del
        formulario de contacto se conservan como máximo 24 meses.
      </p>

      <h2>7. Seguridad</h2>
      <p>
        Aplicamos aislamiento de datos por cliente a nivel de base de datos
        (políticas de seguridad por fila), cifrado en tránsito y en reposo,
        acceso sin contraseñas mediante enlaces de un solo uso y principio de
        mínimo privilegio en el acceso interno.
      </p>

      <h2>8. Tus derechos</h2>
      <p>
        Según la ley que te aplique (PDPL, RGPD, CCPA), puedes solicitar acceso,
        rectificación, supresión, portabilidad u oposición al tratamiento de tus
        datos escribiendo a{' '}
        <a href="mailto:customer@itmano.com">customer@itmano.com</a>. Si tus datos
        están en el CRM de uno de nuestros clientes, dirigiremos tu solicitud a
        ese cliente, que es el responsable del tratamiento. También puedes
        reclamar ante la autoridad de protección de datos de tu jurisdicción.
      </p>

      <h2>9. Cookies</h2>
      <p>
        Este sitio y la plataforma usan únicamente cookies esenciales de sesión
        (autenticación). No usamos cookies publicitarias ni de seguimiento de
        terceros.
      </p>

      <h2>10. Menores</h2>
      <p>El Servicio está dirigido a profesionales y no se dirige a menores de 18 años.</p>

      <h2>11. Cambios</h2>
      <p>
        Los cambios materiales a esta política se notificarán al correo de la
        cuenta con al menos 30 días de anticipación.
      </p>
    </LegalPage>
  )
}
