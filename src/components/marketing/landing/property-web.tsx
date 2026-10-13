'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import { AnimatePresence, m } from 'motion/react'
import { CalendarDays, Check, Globe, Play, Rotate3d, Sparkles, UserPlus } from 'lucide-react'
import { EASE_OUT_PREMIUM } from '@/components/motion/primitives'
import { PROPERTIES } from './demo-data'
import { useArrived, useLive, useTicker } from './crm-bits'

// Propiedades → tu web. A la izquierda la ficha en el CRM (creada con IA desde
// el PDF, con el interruptor de publicar); a la derecha la página pública del
// cliente, clara como las páginas alojadas reales, con su open house, la
// cuenta regresiva y el RSVP. Confirmar asistencia en la demo muestra lo que
// pasa del otro lado: entra un lead al CRM.

const property = PROPERTIES[0]
const START_IN = 2 * 86400 + 14 * 3600 + 6 * 60 + 12

export function PropertyWeb() {
  const ref = useRef<HTMLDivElement>(null)
  const published = useArrived(ref, 0.4)
  const live = useLive(ref)
  const [left, setLeft] = useState(START_IN)
  const [rsvp, setRsvp] = useState(false)
  useTicker(live, 1000, () => setLeft(s => (s > 0 ? s - 1 : START_IN)))

  const d = Math.floor(left / 86400)
  const h = Math.floor((left % 86400) / 3600)
  const min = Math.floor((left % 3600) / 60)
  const s = left % 60
  const pad = (n: number) => String(n).padStart(2, '0')

  return (
    <div ref={ref} className="pw">
      <div className="crm-card pw-crm">
        <div className="pw-crm-photo">
          <Image src={property.photo} alt={property.photoAlt} fill sizes="(max-width: 900px) 90vw, 360px" />
          <span className="pw-ai">
            <Sparkles size={12} aria-hidden /> Creada con IA desde el PDF
          </span>
        </div>
        <div className="pw-crm-body">
          <div className="crm-prop-top">
            <span className="crm-who-name">{property.address}</span>
            <span className="crm-prop-status" data-status={property.status}>
              {property.status}
            </span>
          </div>
          <span className="crm-who-sub">
            {property.area} · {property.mls}
          </span>
          <span className="crm-prop-price">{property.price}</span>
          <span className="crm-who-sub">
            {property.beds} hab · {property.baths} baños · {property.size}
          </span>
          <div className="pw-toggle" data-on={published || undefined}>
            <span className="mk-switch" aria-hidden>
              <span />
            </span>
            <Globe size={13} aria-hidden /> Publicada en tu web
          </div>
          <div className="pw-toggle" data-on={published || undefined} style={{ transitionDelay: '0.5s' }}>
            <span className="mk-switch" aria-hidden style={{ transitionDelay: '0.5s' }}>
              <span style={{ transitionDelay: '0.5s' }} />
            </span>
            <CalendarDays size={13} aria-hidden /> Open house el sábado
          </div>
        </div>
      </div>

      <div className="pw-browser">
        <div className="pw-bar" aria-hidden>
          <span className="crm-dots">
            <i />
            <i />
            <i />
          </span>
          <span className="pw-url">tuagencia.com/propiedades/calle-olmo-12</span>
        </div>
        <div className="pw-page">
          <div className="pw-gallery">
            <div className="pw-main">
              <Image src={property.photo} alt={property.photoAlt} fill sizes="(max-width: 900px) 90vw, 520px" />
            </div>
            <div className="pw-thumbs">
              <div className="pw-thumb">
                <Image src="/landing/sala.webp" alt="Sala amplia con sofá blanco y muro de madera" fill sizes="180px" />
              </div>
              <div className="pw-thumb pw-thumb-more">
                <Image src="/landing/casa-moderna.webp" alt="" fill sizes="180px" />
                <span>+18 fotos</span>
              </div>
            </div>
          </div>

          <div className="pw-info">
            <div>
              <p className="pw-title">{property.address}</p>
              <p className="pw-sub">
                {property.area} · {property.beds} habitaciones · {property.baths} baños · {property.size}
              </p>
            </div>
            <p className="pw-price">{property.price}</p>
          </div>
          <div className="pw-media">
            <span>
              <Rotate3d size={13} aria-hidden /> Tour 3D
            </span>
            <span>
              <Play size={13} aria-hidden /> Video
            </span>
          </div>

          <div className="pw-oh">
            <div>
              <p className="pw-oh-title">Open house · sábado de 11:00 a 14:00</p>
              <p className="pw-oh-clock" aria-label="Cuenta regresiva de ejemplo">
                {[
                  [d, 'd'],
                  [pad(h), 'h'],
                  [pad(min), 'm'],
                  [pad(s), 's'],
                ].map(([v, u]) => (
                  <span key={u}>
                    <b>{v}</b>
                    {u}
                  </span>
                ))}
              </p>
            </div>
            <button type="button" className="pw-rsvp" data-done={rsvp || undefined} onClick={() => setRsvp(true)} disabled={rsvp}>
              {rsvp ? (
                <>
                  <Check size={14} aria-hidden /> Te esperamos
                </>
              ) : (
                'Confirmar asistencia'
              )}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {rsvp && (
            <m.div
              className="crm-toast pw-toast"
              initial={{ opacity: 0, y: 12, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ duration: 0.45, ease: EASE_OUT_PREMIUM, delay: 0.3 }}
              aria-live="polite"
            >
              <span className="crm-toast-icon" data-phase="nuevo">
                <UserPlus size={14} strokeWidth={1.75} aria-hidden />
              </span>
              <span className="crm-who">
                <span className="crm-who-name">En tu CRM: nuevo lead</span>
                <span className="crm-who-sub">Confirmó el open house de Calle Olmo 12 y sube en tu cola</span>
              </span>
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
