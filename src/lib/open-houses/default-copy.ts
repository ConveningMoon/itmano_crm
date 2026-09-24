// Borradores de partida de los correos de un open house. Son copy del PRODUCTO
// (no de un cliente): precargan el composer para que crear un open house no
// obligue a escribir cuatro correos desde cero. El agente los edita, los
// reemplaza con IA o usa un template de Resend.
//
// Mismo tono que el resto de correos del CRM: un mensaje personal, sin
// marketing. El enlace de RSVP va en su propia línea para que el cliente de
// correo lo vuelva clickeable.

import type { OpenHouseEmailKind, OpenHouseLanguage } from './model'

export interface DefaultCopy {
  subject: string
  body:    string
}

const COPY: Record<OpenHouseEmailKind, Record<OpenHouseLanguage, DefaultCopy>> = {
  announcement: {
    es: {
      subject: 'Open house en {{property_name}} — {{open_house_date}}',
      body: [
        'Hola {{customer_name}},',
        'Te escribo porque vamos a abrir las puertas de {{property_name}} ({{property_address}}) y pensé que te podría interesar verla en persona.',
        'Será el {{open_house_date}}, de {{open_house_time}}. {{open_house_notes}}',
        'Si te animas, confírmame aquí para esperarte:\n{{rsvp_url}}',
        'Puedes ver los detalles de la propiedad en {{property_url}} y agregarlo a tu calendario desde {{calendar_url}}',
        'Cualquier duda, respóndeme este correo.',
      ].join('\n\n'),
    },
    en: {
      subject: 'Open house at {{property_name}} — {{open_house_date}}',
      body: [
        'Hi {{customer_name}},',
        "We're opening the doors at {{property_name}} ({{property_address}}) and I thought you might like to see it in person.",
        "It's on {{open_house_date}}, {{open_house_time}}. {{open_house_notes}}",
        'If you can make it, let me know here so I can expect you:\n{{rsvp_url}}',
        'You can see the property details at {{property_url}} and add it to your calendar from {{calendar_url}}',
        'If you have any questions, just reply to this email.',
      ].join('\n\n'),
    },
    pt: {
      subject: 'Open house em {{property_name}} — {{open_house_date}}',
      body: [
        'Olá {{customer_name}},',
        'Vamos abrir as portas de {{property_name}} ({{property_address}}) e pensei que você gostaria de conhecer pessoalmente.',
        'Será em {{open_house_date}}, das {{open_house_time}}. {{open_house_notes}}',
        'Se puder vir, confirme aqui para eu te esperar:\n{{rsvp_url}}',
        'Os detalhes do imóvel estão em {{property_url}} e você pode adicionar à sua agenda em {{calendar_url}}',
        'Qualquer dúvida, é só responder este e-mail.',
      ].join('\n\n'),
    },
  },
  reminder: {
    es: {
      subject: 'Te espero en {{property_name}}',
      body: [
        'Hola {{customer_name}},',
        'Solo quería recordarte que te espero en el open house de {{property_name}} el {{open_house_date}}, de {{open_house_time}}.',
        'La dirección es {{property_address}}. {{open_house_notes}}',
        'Si al final no puedes venir, avísame aquí:\n{{rsvp_url}}',
      ].join('\n\n'),
    },
    en: {
      subject: 'See you at {{property_name}}',
      body: [
        'Hi {{customer_name}},',
        'Just a quick reminder that I\'m expecting you at the open house at {{property_name}} on {{open_house_date}}, {{open_house_time}}.',
        'The address is {{property_address}}. {{open_house_notes}}',
        "If you can't make it after all, let me know here:\n{{rsvp_url}}",
      ].join('\n\n'),
    },
    pt: {
      subject: 'Te espero em {{property_name}}',
      body: [
        'Olá {{customer_name}},',
        'Só para lembrar que te espero no open house de {{property_name}} em {{open_house_date}}, das {{open_house_time}}.',
        'O endereço é {{property_address}}. {{open_house_notes}}',
        'Se não puder vir, me avise aqui:\n{{rsvp_url}}',
      ].join('\n\n'),
    },
  },
  update: {
    es: {
      subject: 'Cambio de horario: open house en {{property_name}}',
      body: [
        'Hola {{customer_name}},',
        'Te escribo para avisarte que cambiamos la fecha del open house de {{property_name}}.',
        'La nueva fecha es el {{open_house_date}}, de {{open_house_time}}. {{open_house_notes}}',
        'Si con el cambio ya no puedes venir (o ahora sí), avísame aquí:\n{{rsvp_url}}',
        'Puedes actualizar tu calendario desde {{calendar_url}}',
      ].join('\n\n'),
    },
    en: {
      subject: 'Schedule change: open house at {{property_name}}',
      body: [
        'Hi {{customer_name}},',
        "I wanted to let you know that we've changed the date of the open house at {{property_name}}.",
        "It's now on {{open_house_date}}, {{open_house_time}}. {{open_house_notes}}",
        "If the new time doesn't work for you (or now it does), let me know here:\n{{rsvp_url}}",
        'You can update your calendar from {{calendar_url}}',
      ].join('\n\n'),
    },
    pt: {
      subject: 'Mudança de horário: open house em {{property_name}}',
      body: [
        'Olá {{customer_name}},',
        'Quero avisar que mudamos a data do open house de {{property_name}}.',
        'A nova data é {{open_house_date}}, das {{open_house_time}}. {{open_house_notes}}',
        'Se com a mudança você não puder vir (ou agora puder), me avise aqui:\n{{rsvp_url}}',
        'Você pode atualizar sua agenda em {{calendar_url}}',
      ].join('\n\n'),
    },
  },
  cancellation: {
    es: {
      subject: 'Se canceló el open house en {{property_name}}',
      body: [
        'Hola {{customer_name}},',
        'Lamento avisarte que el open house de {{property_name}} programado para el {{open_house_date}} se canceló.',
        'Si te interesa conocer la propiedad, respóndeme este correo y coordinamos una visita.',
      ].join('\n\n'),
    },
    en: {
      subject: 'The open house at {{property_name}} is cancelled',
      body: [
        'Hi {{customer_name}},',
        "I'm sorry to let you know that the open house at {{property_name}} scheduled for {{open_house_date}} has been cancelled.",
        "If you'd still like to see the property, reply to this email and we'll set up a visit.",
      ].join('\n\n'),
    },
    pt: {
      subject: 'O open house em {{property_name}} foi cancelado',
      body: [
        'Olá {{customer_name}},',
        'Sinto informar que o open house de {{property_name}} marcado para {{open_house_date}} foi cancelado.',
        'Se ainda quiser conhecer o imóvel, responda este e-mail e combinamos uma visita.',
      ].join('\n\n'),
    },
  },
}

export function defaultOpenHouseCopy(kind: OpenHouseEmailKind, language: OpenHouseLanguage): DefaultCopy {
  return COPY[kind][language]
}
