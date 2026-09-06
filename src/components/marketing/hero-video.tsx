'use client'

import { useEffect, useRef, useState } from 'react'
import { usePrefersReducedMotion } from '@/components/motion/use-prefers-reduced-motion'

// Recorrido del producto — la pieza principal del hero.
//
// Reproduce en silencio y en bucle (única forma de que el navegador permita el
// autoplay). Con prefers-reduced-motion no arranca solo: se muestra el póster
// con los controles nativos y el visitante decide.
//
// Los archivos van en public/landing/ (ver el README de esa carpeta). Mientras
// no existan, se muestra un marcador sobrio en vez de un rectángulo negro, así
// la página se puede montar antes de que el video esté grabado.

const SOURCES = { webm: '/landing/producto.webm', mp4: '/landing/producto.mp4' }
const POSTER = '/landing/producto-poster.webp'

export function HeroVideo() {
  const reduced = usePrefersReducedMotion()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const fail = () => setMissing(true)

    // El `error` de un <source> se dispara sobre el propio <source> y NO
    // burbujea — el onError de React nunca lo ve. En fase de captura sí llega.
    video.addEventListener('error', fail, true)
    // Y si la selección de fuentes ya se agotó antes de montar este efecto,
    // ningún evento futuro lo va a avisar: hay que preguntarlo.
    if (video.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) fail()

    return () => video.removeEventListener('error', fail, true)
  }, [])

  return (
    <div className="mk-video-frame">
      {missing && (
        <div className="mk-video-fallback">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/itmano_logo.webp" alt="" aria-hidden width={36} height={36} className="img-tint-gold" />
          <span>Recorrido del producto</span>
        </div>
      )}
      <video
        ref={videoRef}
        className="mk-video"
        poster={POSTER}
        muted
        playsInline
        autoPlay={!reduced}
        loop={!reduced}
        controls={reduced && !missing}
        preload="metadata"
        hidden={missing}
        aria-label="Recorrido por el CRM de ITMANO: la lista del día, el análisis de cada lead, el seguimiento y las propiedades."
      >
        <source src={SOURCES.webm} type="video/webm" />
        <source src={SOURCES.mp4} type="video/mp4" />
      </video>
    </div>
  )
}
