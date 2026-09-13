import { describe, it, expect } from 'vitest'
import { resolveLeadEmailLanguage } from '@/lib/services/lead-email-language'

// Esta regla decide en qué idioma sale un correo automático a un lead: los de
// hitos del proceso de compra (036/058) y, desde la 117, los que dispara una
// etiqueta. Manda el agente y no sólo el lead porque el correo lo firma él y las
// respuestas le llegan a él: escribirle en portugués a un lead cuyo agente no lo
// habla abre una conversación que nadie puede sostener.

describe('resolveLeadEmailLanguage', () => {
  it('el lead recibe SU idioma si el agente lo atiende', () => {
    expect(resolveLeadEmailLanguage(['es', 'en'], 'es', 'en')).toBe('en')
    expect(resolveLeadEmailLanguage(['es', 'en'], 'en', 'es')).toBe('es')
  })

  it('si el agente no atiende ese idioma pero sabe inglés, va en inglés (no en español)', () => {
    // El default NO es el idioma principal del agente: un lead que escribe en
    // portugués entiende antes un correo en inglés que uno en español.
    expect(resolveLeadEmailLanguage(['es', 'en'], 'es', 'pt')).toBe('en')
  })

  it('sin inglés, cae al idioma principal del agente', () => {
    expect(resolveLeadEmailLanguage(['es'], 'es', 'pt')).toBe('es')
  })

  it('un idioma de lead que no existe se ignora', () => {
    expect(resolveLeadEmailLanguage(['es'], 'es', 'klingon')).toBe('es')
    expect(resolveLeadEmailLanguage(['es'], 'es', null)).toBe('es')
  })

  it('agente sin idiomas declarados: manda su principal', () => {
    expect(resolveLeadEmailLanguage(null, 'pt', 'es')).toBe('pt')
    expect(resolveLeadEmailLanguage([], 'pt', 'es')).toBe('pt')
  })

  it('sin nada utilizable, inglés como último recurso', () => {
    // Ningún dato válido no puede significar "no mandar": el correo de cierre es
    // transaccional. Inglés es la elección menos mala.
    expect(resolveLeadEmailLanguage([], 'klingon', null)).toBe('en')
  })

  it('descarta idiomas no soportados de la lista del agente', () => {
    expect(resolveLeadEmailLanguage(['klingon', 'en'], 'klingon', 'klingon')).toBe('en')
  })
})
