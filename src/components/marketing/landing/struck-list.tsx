'use client'

import { m } from 'motion/react'
import { EASE_OUT_PREMIUM } from '@/components/motion/primitives'

// Lo que un CRM genérico trae y este no: cada promesa se tacha al entrar en
// pantalla. El texto se lee completo antes y después del trazo — la línea es
// el énfasis, no una condición para entenderlo.

interface Item {
  title: string
  body: string
}

export function StruckList({ items }: { items: readonly Item[] }) {
  return (
    <ul className="mk-struck">
      {items.map((item, i) => (
        <li key={item.title} className="mk-struck-item">
          <p className="mk-struck-title">
            {/* El trazo es un fondo del propio texto: en una frase que ocupa
                dos líneas, se dibuja de corrido por las dos, en orden. */}
            <m.span
              className="mk-struck-words"
              initial={{ backgroundSize: '0% 2px' }}
              whileInView={{ backgroundSize: '100% 2px' }}
              viewport={{ once: true, amount: 1, margin: '0px 0px -15% 0px' }}
              transition={{ duration: 0.8, delay: 0.1 + i * 0.06, ease: EASE_OUT_PREMIUM }}
            >
              {item.title}
            </m.span>
          </p>
          <p className="mk-struck-body">{item.body}</p>
        </li>
      ))}
    </ul>
  )
}

/** Línea que se dibuja de izquierda a derecha al entrar en pantalla. */
export function DrawRule({ className }: { className?: string }) {
  return (
    <m.span
      className={className}
      aria-hidden
      initial={{ scaleX: 0 }}
      whileInView={{ scaleX: 1 }}
      viewport={{ once: true, amount: 1 }}
      transition={{ duration: 1.1, ease: EASE_OUT_PREMIUM }}
    />
  )
}
