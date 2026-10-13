'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import { FileSearch, PenLine, Send, UserPlus } from 'lucide-react'
import { useLive, useTicker } from './crm-bits'

// Newsletters: la edición publicada en news.itmano.com con la firma del agente
// y, al lado, el camino que recorre: la IA investiga el mercado, redacta, una
// persona la revisa y publica, y cada suscriptor entra como lead.

const STEPS = [
  { icon: FileSearch, title: 'La IA investiga tu mercado', body: 'Busca sólo en las fuentes que tú apruebas, con las cifras del mes.' },
  { icon: PenLine, title: 'Redacta la edición', body: 'Con tu tono, una portada propia y la firma del agente.' },
  { icon: Send, title: 'Tú la revisas y la publicas', body: 'Nada sale sin que alguien de tu equipo lo apruebe.' },
  { icon: UserPlus, title: 'Cada suscriptor es un lead', body: 'Con su consentimiento, y sabiendo desde qué edición llegó.' },
]

export function NewsletterEdition() {
  const ref = useRef<HTMLDivElement>(null)
  const live = useLive(ref)
  const [step, setStep] = useState(0)
  useTicker(live, 2600, () => setStep(s => (s + 1) % STEPS.length))

  return (
    <div ref={ref} className="nl">
      <ol className="nl-steps">
        {STEPS.map((s, i) => (
          <li key={s.title} className="nl-step" data-on={i === step || undefined} data-done={i < step || undefined}>
            <span className="nl-step-icon">
              <s.icon size={16} strokeWidth={1.75} aria-hidden />
            </span>
            <span>
              <span className="nl-step-title">{s.title}</span>
              <span className="nl-step-body">{s.body}</span>
            </span>
          </li>
        ))}
      </ol>

      <article className="nl-edition" aria-label="Edición de ejemplo de una newsletter">
        <div className="nl-url" aria-hidden>
          news.itmano.com/tu-agencia/otono-buen-momento-para-listar
        </div>
        <div className="nl-cover">
          <Image src="/landing/casa-moderna.webp" alt="Casa moderna con jardín al atardecer" fill sizes="(max-width: 900px) 90vw, 560px" />
        </div>
        <div className="nl-body">
          <p className="nl-kind">Mercado · Octubre</p>
          <h3 className="nl-title">Por qué este otoño conviene listar antes de diciembre</h3>
          <p className="nl-by">
            <span className="crm-avatar" style={{ width: 26, height: 26, fontSize: 10, ['--tone' as string]: 'var(--accent-gold)' }} aria-hidden>
              LM
            </span>
            Laura Méndez · Tu agencia · 4 min de lectura
          </p>
          <p className="nl-text">
            Los compradores que se preaprobaron en verano siguen buscando y la oferta todavía no repunta. Estas son las cifras de tu zona y lo que significan para quien piensa vender.
          </p>
          <div className="nl-sub">
            <span>tu@email.com</span>
            <span className="nl-sub-btn">Suscribirme</span>
          </div>
        </div>
      </article>
    </div>
  )
}
