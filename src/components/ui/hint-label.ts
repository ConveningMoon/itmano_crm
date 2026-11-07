// Nombre accesible de un ⓘ (InfoHint) que explica `subject`: el título o la
// etiqueta junto a la que está. "Qué es Slug" sonaba raro en un lector de
// pantalla y no servía para títulos que no son un concepto ("Consumo por mes").
//
// Vive fuera de info-hint.tsx porque ese módulo es 'use client': un Server
// Component (PageHeader) no puede llamar a una función exportada desde ahí.
export function hintLabel(subject: string): string {
  return `Más información sobre ${subject}`
}
