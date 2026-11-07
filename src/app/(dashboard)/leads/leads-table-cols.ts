// Plantillas de columnas de la tabla de leads. Viven fuera de leads-client.tsx
// ('use client') para que el esqueleto, que es Server Component, use las mismas.
//
// En pantallas medianas se van Agente, Fuente e Idioma; en
// estrechas también Calidad y Fecha, que pasan a la línea de meta del lead. Así
// la tabla nunca necesita scroll lateral.
export const TABLE_COLS    = '20px minmax(200px, 2.2fr) 120px 118px minmax(110px, 1fr) 104px 52px 64px'
export const TABLE_COLS_MD = '20px minmax(0, 2fr) 118px 104px 64px'
export const TABLE_COLS_SM = '20px minmax(0, 1fr) auto'
