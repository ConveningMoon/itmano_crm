// Borradores de partida de los correos de un open house. Son copy del PRODUCTO
// (no de un cliente): precargan el composer para que crear un open house no
// obligue a escribir cuatro correos desde cero. El agente los edita, los
// reemplaza con IA o usa un template de Resend.
//
// Mismo tono que el resto de correos del CRM: un mensaje personal, sin
// marketing. Sin enlaces en el texto: la plantilla ya muestra la fecha, la
// dirección y los botones de confirmar, agendar y llegar.

import type { OpenHouseEmailKind, OpenHouseLanguage } from './model'

export interface DefaultCopy {
  subject: string
  body:    string
}

const COPY: Record<OpenHouseEmailKind, Record<OpenHouseLanguage, DefaultCopy>> = {
  announcement: {
    es: {
      subject: 'Te invito al open house de {{property_name}}',
      body: [
        'Hola {{customer_name}},',
        'Vamos a abrir las puertas de {{property_name}} el {{open_house_date}} y pensé en ti: es una buena oportunidad para verla con calma y resolver tus dudas en persona.',
        'Si te animas, confírmame con el botón de abajo para esperarte.',
      ].join('\n\n'),
    },
    en: {
      subject: "You're invited to the open house at {{property_name}}",
      body: [
        'Hi {{customer_name}},',
        "We're opening the doors at {{property_name}} on {{open_house_date}} and I thought of you: it's a great chance to walk through it and ask me anything in person.",
        'If you can make it, just let me know with the button below.',
      ].join('\n\n'),
    },
    pt: {
      subject: 'Você está convidado para o open house de {{property_name}}',
      body: [
        'Olá {{customer_name}},',
        'Vamos abrir as portas de {{property_name}} em {{open_house_date}} e lembrei de você: é uma ótima oportunidade para conhecer o imóvel com calma e tirar suas dúvidas pessoalmente.',
        'Se puder vir, confirme pelo botão abaixo.',
      ].join('\n\n'),
    },
  },
  reminder: {
    es: {
      subject: 'Te espero en {{property_name}}',
      body: [
        'Hola {{customer_name}},',
        'Solo quería recordarte que te espero en el open house de {{property_name}}. Aquí abajo tienes la dirección y la hora.',
        'Si al final no puedes venir, avísame con el botón.',
      ].join('\n\n'),
    },
    en: {
      subject: 'See you at {{property_name}}',
      body: [
        'Hi {{customer_name}},',
        "Just a quick reminder that I'm expecting you at the open house at {{property_name}}. The address and time are below.",
        "If you can't make it after all, let me know with the button.",
      ].join('\n\n'),
    },
    pt: {
      subject: 'Te espero em {{property_name}}',
      body: [
        'Olá {{customer_name}},',
        'Só para lembrar que te espero no open house de {{property_name}}. O endereço e o horário estão logo abaixo.',
        'Se não puder vir, me avise pelo botão.',
      ].join('\n\n'),
    },
  },
  update: {
    es: {
      subject: 'Cambio de fecha: open house en {{property_name}}',
      body: [
        'Hola {{customer_name}},',
        'Te escribo para avisarte que cambiamos la fecha del open house de {{property_name}}. Abajo tienes el nuevo horario.',
        'Si con el cambio ya no puedes venir (o ahora sí), avísame con el botón.',
      ].join('\n\n'),
    },
    en: {
      subject: 'New date: open house at {{property_name}}',
      body: [
        'Hi {{customer_name}},',
        "I wanted to let you know that we've changed the date of the open house at {{property_name}}. The new time is below.",
        "If the new date doesn't work for you (or now it does), let me know with the button.",
      ].join('\n\n'),
    },
    pt: {
      subject: 'Nova data: open house em {{property_name}}',
      body: [
        'Olá {{customer_name}},',
        'Quero avisar que mudamos a data do open house de {{property_name}}. O novo horário está logo abaixo.',
        'Se com a mudança você não puder vir (ou agora puder), me avise pelo botão.',
      ].join('\n\n'),
    },
  },
  cancellation: {
    es: {
      subject: 'Se canceló el open house de {{property_name}}',
      body: [
        'Hola {{customer_name}},',
        'Lamento avisarte que el open house de {{property_name}} se canceló.',
        'Si te interesa conocer la propiedad, respóndeme este correo y coordinamos una visita a tu medida.',
      ].join('\n\n'),
    },
    en: {
      subject: 'The open house at {{property_name}} is cancelled',
      body: [
        'Hi {{customer_name}},',
        "I'm sorry to let you know that the open house at {{property_name}} has been cancelled.",
        "If you'd still like to see the property, reply to this email and we'll set up a visit that works for you.",
      ].join('\n\n'),
    },
    pt: {
      subject: 'O open house de {{property_name}} foi cancelado',
      body: [
        'Olá {{customer_name}},',
        'Sinto informar que o open house de {{property_name}} foi cancelado.',
        'Se ainda quiser conhecer o imóvel, responda este e-mail e combinamos uma visita no seu horário.',
      ].join('\n\n'),
    },
  },
}

export function defaultOpenHouseCopy(kind: OpenHouseEmailKind, language: OpenHouseLanguage): DefaultCopy {
  return COPY[kind][language]
}
