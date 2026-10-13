'use client'

import { useRef, useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { Check, Clock, CornerDownLeft, Tag } from 'lucide-react'
import { EASE_OUT_PREMIUM } from '@/components/motion/primitives'
import { useArrived, useLive, useTicker } from './crm-bits'

// Seguimiento: a la izquierda la secuencia tal como se configura en Emails
// (se activa con un formulario o con una etiqueta), a la derecha el correo que
// recibe el lead, firmado por su agente sobre el dominio del equipo y en su
// idioma. El selector de idioma cambia el correo de verdad.

const STEPS = [
  { when: 'Día 0', subject: 'Tu guía para vender este año', state: 'Enviado', icon: Check },
  { when: 'Día 2', subject: 'Cuánto vale tu casa hoy', state: 'Enviado', icon: Check },
  { when: 'Día 3', subject: 'Respondió: “¿Podemos hablar el jueves?”', state: 'Respuesta', icon: CornerDownLeft, reply: true },
  { when: 'Día 5', subject: 'Tres errores al poner precio', state: 'Programado', icon: Clock, muted: true },
]

const MAIL = {
  ES: {
    subject: 'Cuánto vale tu casa hoy',
    hello: 'Hola, Mariana:',
    body: 'Te comparto las dos ventas más recientes de tu calle. Si quieres, esta semana paso a ver la casa y te doy un valor realista, sin compromiso.',
    sign: 'Laura Méndez · Tu agencia',
  },
  EN: {
    subject: 'What your home is worth today',
    hello: 'Hi Mariana,',
    body: 'Here are the two most recent sales on your street. If you like, I can stop by this week and give you a realistic value, no strings attached.',
    sign: 'Laura Méndez · Your agency',
  },
  PT: {
    subject: 'Quanto vale sua casa hoje',
    hello: 'Olá, Mariana,',
    body: 'Compartilho as duas vendas mais recentes da sua rua. Se quiser, esta semana passo para ver a casa e te dou um valor realista, sem compromisso.',
    sign: 'Laura Méndez · Sua agência',
  },
} as const

type Lang = keyof typeof MAIL
const LANGS = Object.keys(MAIL) as Lang[]

export function FollowUp() {
  const ref = useRef<HTMLDivElement>(null)
  const arrived = useArrived(ref)
  const live = useLive(ref)
  const [lang, setLang] = useState<Lang>('ES')
  const [held, setHeld] = useState(false)
  useTicker(live && !held, 3600, () => setLang(l => LANGS[(LANGS.indexOf(l) + 1) % LANGS.length]))
  const mail = MAIL[lang]

  return (
    <div ref={ref} className="fu">
      <div className="crm-card fu-seq">
        <div className="fu-seq-head">
          <div>
            <p className="crm-card-title">Vendedores · Guía</p>
            <p className="crm-card-sub">Se activa cuando alguien llena la guía para vendedores</p>
          </div>
          <span className="fu-live">
            <i aria-hidden /> Activa
          </span>
        </div>
        <ol className="fu-steps">
          {STEPS.map((s, i) => (
            <m.li
              key={s.when}
              className="fu-step"
              data-reply={s.reply || undefined}
              data-muted={s.muted || undefined}
              initial={false}
              animate={{ opacity: arrived ? 1 : 0.25 }}
              transition={{ duration: 0.4, delay: arrived ? 0.15 + i * 0.25 : 0 }}
            >
              <span className="fu-step-when">{s.when}</span>
              <span className="fu-step-subject">{s.subject}</span>
              <span className="fu-step-state">
                <s.icon size={12} strokeWidth={2} aria-hidden /> {s.state}
              </span>
            </m.li>
          ))}
        </ol>
        <div className="fu-tag">
          <Tag size={14} strokeWidth={1.75} aria-hidden />
          <span>
            Si le pones la etiqueta <strong>pre-aprobado</strong>, sale sola la secuencia «Siguientes pasos con tu banco», en el idioma del lead.
          </span>
        </div>
      </div>

      <div className="fu-phone" aria-label="Correo de ejemplo recibido por el lead">
        <div className="fu-phone-bar" aria-hidden>
          <span>9:41</span>
          <span className="fu-phone-notch" />
          <span>100%</span>
        </div>
        <div className="fu-langs" role="group" aria-label="Idioma del correo">
          {LANGS.map(l => (
            <button
              key={l}
              type="button"
              aria-pressed={lang === l}
              onClick={() => {
                setHeld(true)
                setLang(l)
              }}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="fu-mail">
          <div className="fu-from">
            <span className="crm-avatar" style={{ width: 34, height: 34, fontSize: 12, ['--tone' as string]: 'var(--accent-gold)' }} aria-hidden>
              LM
            </span>
            <span className="crm-who">
              <span className="crm-who-name">Laura Méndez</span>
              <span className="crm-who-sub">laura@mail.tuagencia.com</span>
            </span>
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <m.div
              key={lang}
              initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
              transition={{ duration: 0.35, ease: EASE_OUT_PREMIUM }}
            >
              <p className="fu-subject">{mail.subject}</p>
              <p className="fu-text">{mail.hello}</p>
              <p className="fu-text">{mail.body}</p>
              <p className="fu-sign">{mail.sign}</p>
            </m.div>
          </AnimatePresence>
          <p className="fu-unsub">Darse de baja</p>
        </div>
      </div>
    </div>
  )
}
