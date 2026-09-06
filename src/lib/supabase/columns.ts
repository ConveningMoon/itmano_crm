import type { Database } from './database.types'

// Listas de columnas verificadas contra el esquema real.
//
// El problema que resuelve: los `.select()` de PostgREST son strings, y un
// nombre de columna equivocado no falla al compilar — falla en producción. La
// migración 082 quitó `attention_when` de `leads_list`, el select siguió
// pidiéndola y /leads dejó de cargar.
//
// Tipar el cliente (`createClient<Database>`) NO alcanza para esto: supabase-js
// codifica el fallo en el TIPO DEL RESULTADO (`SelectQueryError<"column ... does
// not exist">`), así que sólo salta si ese resultado se asigna a algo tipado.
// Este repo castea los resultados a `any` en casi todas las consultas —
// deliberadamente, porque el cliente no está tipado— y ese cast se traga el
// error. Verificado: con el cliente tipado, el select de `attention_when`
// compilaba igual.
//
// Esto ataca el problema un paso antes: la lista se valida como DATO, contra el
// esquema generado, y el `as any` de después ya no puede esconder nada.
//
//   const LIST_COLUMNS = columns('leads_list', ['id', 'stage', 'urgency'])
//
// Un nombre que no exista es error de tsc señalando el literal exacto.

type PublicSchema = Database['public']
type Relations    = PublicSchema['Tables'] & PublicSchema['Views']

/** Cualquier tabla o vista del esquema public. */
export type Relation = keyof Relations

/** Los nombres de columna válidos de esa tabla o vista. */
export type ColumnOf<R extends Relation> =
  Relations[R] extends { Row: infer Row } ? Extract<keyof Row, string> : never

/**
 * Arma el string de `.select()` a partir de una lista tipada.
 *
 * El primer argumento sólo existe para fijar el tipo de la lista; no se usa en
 * runtime. Se pide igual porque leerlo junto a la lista es lo que hace obvio
 * contra qué esquema se está validando.
 */
export function columns<R extends Relation>(
  relation: R,
  list: readonly ColumnOf<R>[],
): string {
  void relation
  return list.join(', ')
}
