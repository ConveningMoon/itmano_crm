# Calidad + Urgencia — rediseño del scoring de cara al agente
Fecha: 2026-07-31 · Fase A (aditiva, sin romper `status`)

## Por qué

El score actual mezcla dos preguntas independientes en un solo número, y de ahí
salen tres problemas concretos:

1. **El decaimiento miente.** Un comprador con efectivo de hace tres meses sigue
   teniendo efectivo. Hoy su score baja, como si el lead hubiera empeorado. Lo
   que cambió no es el lead: es que llegamos tarde.
2. **`leads.status` hace dos trabajos.** `new/nurturing/warm/hot` los calcula el
   sistema; `process_started/closed/lost` los pone el agente. Por eso hubo que
   inventar el "congelado": la misma columna no puede ser derivada y manual a la
   vez. El freeze no es una regla de negocio, es un parche.
3. **El agente ve jerga.** Fit, engagement, manual, score, temperatura. Nada de
   eso le dice a quién llamar ni qué decirle.

## El modelo

Tres ejes, cada uno con una pregunta y un dueño distintos:

| Eje | Pregunta | Quién lo mueve | ¿Decae? |
|---|---|---|---|
| **Etapa** | ¿Dónde está en el proceso? | El agente | No |
| **Calidad** | ¿Qué tan bueno es este lead? | El sistema | **No** |
| **Urgencia** | ¿Debo actuar hoy? | El sistema | **Sí** |

Un lead excelente que se quedó callado **no baja de calidad**: baja de urgencia.
Eso es lo que arregla el punto 1.

---

## Etapa

Valores: **Nuevo · En Nutrición · En proceso · Cerrado · Perdido**

En Fase A NO se toca `leads.status`; la etapa se deriva:

| `status` actual | Etapa |
|---|---|
| `new` | Nuevo |
| `nurturing`, `warm`, `hot` | En Nutrición |
| `process_started` | En proceso |
| `process_completed`, `closed` | Cerrado |
| `lost` | Perdido |

En Fase B pasa a ser su propia columna y `status` deja de existir como mezcla.

---

## Calidad

**Definición:** evidencia acumulada de que este lead puede y quiere transaccionar.
No caduca.

```
calidad_bruta = fit_score + manual_score + engagement_sin_decaimiento
```

La diferencia con `current_score` es una sola pero es la clave: el engagement
entra **sin el factor de decaimiento**. Haber hecho clic en un correo es un hecho
que ocurrió; no se deshace con el tiempo. Lo que envejece es la oportunidad de
responder, y eso es urgencia.

`fit_score` y `manual_score` ya se guardan sin decaimiento, así que solo hace
falta el engagement crudo.

### Las cinco bandas

**Alta · Media alta · Media · Media baja · Baja**

Los cortes NO son números inventados: son **quintiles de la cartera activa del
tenant**. "Alta" significa *el 20% mejor de lo que tienes ahora mismo*.

Esto es deliberado y resuelve el problema de fondo de todo el modelo: no hay que
justificar por qué el corte está en 60 y no en 65. La banda es una afirmación
comparativa dentro de la propia cartera, que es exactamente la decisión que toma
el agente cuando tiene tiempo para diez llamadas y cuarenta leads.

**Contrapartida honesta:** las bandas son relativas, así que un lead puede bajar
de banda sin que él haya cambiado, porque entraron otros mejores. Es correcto
para priorizar y puede ser confuso como etiqueta. Mitigaciones:

- Los cortes se recalculan una vez al día, no en cada lectura, para que la
  etiqueta no baile dentro de la misma jornada.
- Solo cuentan los leads **activos** (etapa Nuevo o En Nutrición). Cerrar un buen
  lead no degrada a los demás.
- **Con menos de 20 leads activos los quintiles no significan nada**, así que se
  cae a cortes fijos sobre la calidad normalizada. La transición ocurre sola.

---

## Urgencia

**Definición:** cuán reciente y accionable es la última señal. Es una función
pura del tiempo — **no se almacena**, se deriva al leer.

Consecuencia directa: **el cron de decay deja de hacer falta**. Hoy existe solo
para materializar el decaimiento en `current_score`; si la urgencia se calcula en
el SELECT, siempre está fresca sin que nada corra a medianoche.

Valores: **Hoy · Esta semana · Sin prisa**

Orden de resolución:

1. Si hay briefing de IA con `next_action_when`, manda ese valor. La IA ya
   produce exactamente estos tres valores.
2. Si no, regla determinista sobre `last_event_at` y el tipo del último evento:
   - Respuesta a correo o pregunta de contacto en las últimas 48 h → **Hoy**
   - Cualquier señal positiva en los últimos 7 días → **Esta semana**
   - Resto → **Sin prisa**

Las etapas En proceso / Cerrado / Perdido salen de la cola: no compiten por la
atención del día.

Esto formaliza y nombra lo que hoy hace `attention_rank` en la vista
`leads_list`. **La urgencia no depende de la IA**: con la IA apagada la regla
determinista cubre el caso, igual que hoy.

---

## Prioridad — cómo se combinan

**Lexicográfica**, no una fórmula ponderada:

```
ORDER BY urgencia ASC, calidad DESC
```

> Primero lo que caduca; dentro de eso, lo mejor.

Se evita a propósito inventar un tipo de cambio entre los dos ejes (¿cuántos
puntos de calidad vale un día de urgencia?). Ese es exactamente el error que
tiene hoy el modelo de puntos y no se va a repetir.

### Coste

La posición es un `count` con filtro sobre un índice: ~2 ms medidos hoy, y sigue
en milisegundos con 100k filas porque es un index-only scan sobre un rango
acotado. **El riesgo no es la base de datos: es calcular el ranking en
JavaScript**, trayendo todos los leads para ordenarlos en memoria — el patrón que
ya se retiró de este repo.

Con volumen alto la posición absoluta pierde sentido: **"#247 de 1000" no le
sirve a nadie.** Por encima de ~100 leads activos la tarjeta muestra percentil
("top 5% de tu cartera") en vez de posición.

---

## Qué ve el agente

Reemplaza las tarjetas "Desglose del score" y "Temperatura del lead":

```
Prioridad · #2 de 34 activos                    [Calidad alta]

Por qué        Paga en efectivo · compra en <3 meses · sin agente
Ojo con        Debe vender su casa primero
Próximo paso   Llamar hoy — respondió tu correo hace 2 horas
```

Cero jerga: no aparecen fit, engagement ni manual. El desglose numérico queda
detrás de "ver detalle", para auditar y para depurar.

**"Ojo con"** sale de dimensiones que el formulario de A&J **ya pregunta y el
modelo hoy descarta**: contingencia de venta, uso (vivienda vs inversión) y
encaje geográfico. Capturarlas es parte de esta fase — es señal gratis.

**La IA narra, no calcula.** Calidad, urgencia y orden son aritmética y funcionan
con la IA apagada o sin presupuesto. La IA aporta el "por qué" y afina el "cuándo".

---

## Dashboard

| Hoy | Propuesto |
|---|---|
| Total Leads · Leads Calientes · En Proceso · Cerrados | Activos · Calidad alta · **Urgentes hoy** · Cerrados del mes |
| Lista "Leads Calientes" (top 6 por score) | **"Tu cola de hoy"** — la cola de prioridad |
| Barras por los 8 `status` | Embudo por **etapa** (4) con tasa de paso entre etapas |

El cambio de fondo: la página deja de ser un resumen y pasa a responder *¿qué
hago ahora?*. La cola de prioridad es lo único que un agente necesita ver al
abrir el CRM por la mañana.

El embudo por etapa además da algo que hoy no existe: **la tasa de conversión
entre etapas**. Cuántos Nuevos pasan a Nutrición, cuántos a Proceso, cuántos
cierran. Eso es lo que una agencia quiere saber de su operación.

## Analytics

| Hoy | Propuesto | Por qué |
|---|---|---|
| "Temperatura promedio" | **Distribución de calidad** (las 5 bandas) | Un promedio de una escala arbitraria no significa nada; una distribución sí |
| Serie mensual por banda de score | Serie mensual por **etapa** | Mide progreso del negocio, no del termómetro |
| Por fuente: solo volumen | Por fuente: volumen **+ calidad media** | Responde "qué canal trae *mejores* leads", no solo más |
| Por agente: total/calientes/cerrados | + **tiempo de respuesta a urgentes** | Métrica operativa que sí mueve cierres |

La tabla por fuente con calidad media es probablemente el cambio de más valor
comercial: hoy no hay forma de saber si el canal que trae 40 leads los trae
buenos o basura.

---

## Alcance de la Fase A

**Aditivo. Nada rompe.**

- Nueva columna `leads.quality_score`, escrita por el trigger que ya existe.
- `calidad_banda` y `urgencia` derivadas en la vista `leads_list`.
- `status` sigue igual; la etapa se deriva de él.
- Se retiran de la UI del agente el desglose y la temperatura.
- Se capturan las tres dimensiones nuevas del formulario.
- Se reestructuran dashboard y analytics.

Queda para Fase B: separar `status` en `etapa` (columna propia), retirar el
concepto de congelado, el multiplicador de valor por comisión (necesita el Perfil
de negocio) y la calibración de pesos.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Las bandas relativas confunden al bajar sin causa aparente | Recalcular cortes 1×/día · solo cartera activa · fallback fijo bajo 20 leads |
| Dos modelos conviviendo (score viejo + calidad) durante la Fase A | `current_score` deja de mostrarse al agente; queda como interno hasta la Fase B |
| El ranking se vuelve caro | Se calcula en Postgres con índice; nunca en JS |
| El agente pierde el desglose que ya conocía | Sigue disponible en "ver detalle" |
