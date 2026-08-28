# Entrega de Agosto — Propheta

**Bot de trading algorítmico sobre señales políticas (X → NLP → Kalshi)**

| | |
| --- | --- |
| Entrega | Primera entrega formal — fin de agosto |
| Fase del roadmap | Fase 0 — Viabilidad y diseño |
| Entorno objetivo | Kalshi **demo** (`external-api.demo.kalshi.co`) — nunca producción |
| Modo de operación | `DRY_RUN=true` (pipeline completo, sin envío de órdenes) |
| Documentos base | `docs/projectDefenition/initial_investigation.md`, `docs/projectDefenition/functionality_&_limits.md` |

---

## 0. Resumen de la entrega

Esta entrega no busca un pipeline funcionando de punta a punta: busca cerrar las
tres preguntas que, si se responden mal, invalidan partes enteras del diseño más
adelante.

1. **¿Tenemos acceso real?** — cuenta de X con créditos y endpoints habilitados,
   cuenta demo de Kalshi con par de claves RSA. → §1
2. **¿Cuánto cuesta y por qué vía ingerimos?** — X pasó a *pay-per-use* en
   febrero de 2026; la vía de ingesta tiene trade-offs de costo y disponibilidad
   que hay que fijar antes de programar. → §2 y §3
3. **¿Cómo se descompone el sistema y sobre qué temas opera?** — arquitectura del
   pipeline con la tecnología ya elegida por etapa, y taxonomía inicial mapeada a
   tags/series de Kalshi. → §4 y §5

---

## 1. Confirmación de acceso

### 1.1 X (Twitter) API

| Ítem | Estado | Evidencia a adjuntar |
| --- | --- | --- |
| Cuenta de desarrollador creada | Listo | Captura de la Developer Console (app + project) |
| Créditos cargados (modelo *pay-per-use*) | Listo | Captura del saldo de créditos |
| `spending limit` por ciclo configurado | Pendiente | Captura de la sección de billing |
| Bearer Token (OAuth2 App-Only) obtenido | Listo | Guardado como `X_BEARER_TOKEN` (fuera del repo) |
| Consumer secret (para CRC / firma) obtenido | Listo | Guardado como `X_WEBHOOK_CONSUMER_SECRET` (fuera del repo) |

**Verificación de endpoints habilitados.** Lo que hay que confirmar contra la
consola con la cuenta real del proyecto, no contra la documentación genérica:

| Endpoint / capacidad | Necesario para | Estado |
| --- | --- | --- |
| `POST /2/activity/subscriptions` (evento `post.create`, filtro `user_id`) | Vía de ingesta principal | Habilitado |
| `GET /2/activity/stream` | Fallback de entrega (stream persistente) | Habilitado |
| `POST /2/webhooks`, `GET /2/webhooks`, `PUT /2/webhooks/:id` | Registro, monitoreo y reactivación del webhook | Habilitado |
| `POST /2/webhooks/replay` | Recuperar eventos perdidos tras una caída | A verificar |
| `GET /2/users/by/username/:handle` | Resolver `handle → user_id` (una sola vez, cacheado) | Habilitado |
| `GET /2/tweets/search/stream` (Filtered Stream v2) | Alternativa por keywords — **disponibilidad ambigua en pay-per-use** | A verificar |
| Filtered Stream **Webhooks** | — | Descartado (sólo Enterprise) |

**Punto abierto.** El Filtered Stream v2: las fuentes de terceros se contradicen
sobre si sigue disponible en *pay-per-use* o quedó restringido a Pro/Enterprise.
No bloquea la entrega porque no es la vía elegida (§3), pero conviene dejarlo
confirmado antes de considerarlo como plan B.

### 1.2 Kalshi

| Ítem | Estado | Evidencia a adjuntar |
| --- | --- | --- |
| Cuenta **demo** creada en `demo.kalshi.co` | Listo | Captura del dashboard demo |
| Par de claves RSA generado (Account & security → API Keys → Create Key) | Listo | Captura del API Key ID (UUID) — **nunca la clave privada** |
| Clave privada `.key` guardada fuera del repo | Listo | Ruta local / gestor de secretos |
| `GET /portfolio/balance` firmado responde 200 contra demo | Pendiente | Salida del script de smoke test |
| Developer Agreement leído | Pendiente | — |

**Advertencia operativa registrada:** la clave privada **no se puede recuperar**
después de cerrar la pantalla de creación. Si se pierde, hay que generar un par
nuevo. Por eso el `.key` no vive en el repo ni en `.env` versionado.

Detalles de firma que ya quedaron documentados para no perder horas depurando
(ver `initial_investigation.md` §5.2):

- RSA-**PSS** con MGF1(SHA-256) y `salt_length = 32` — **no** PKCS#1 v1.5.
- Mensaje firmado: `timestamp + MÉTODO_HTTP + path`, con el path incluyendo
  `/trade-api/v2` y **excluyendo** el query string.
- Timestamp en **milisegundos**. Es la causa nº 1 de `401`.
- El reloj del contenedor debe estar sincronizado por NTP: la deriva de reloj
  devuelve el mismo `401` opaco que una clave equivocada.

### 1.3 Cumplimiento del requisito "herramientas gratuitas"

| Herramienta | Costo | Tarjeta requerida |
| --- | --- | --- |
| Kalshi **demo** | Gratis | No |
| PostgreSQL, Redis, Docker Compose, Node/TS, React/Vite | Gratis (OSS) | No |
| `mocks/x-api-mock/` (mock propio de la X Activity API) | Gratis | No |
| API de X (real) | **Pay-per-use** — USD 0,005 por evento | **Sí** |

**Tensión que declaramos explícitamente:** X eliminó el tier gratuito para nuevos
desarrolladores en febrero de 2026, así que la única pieza del stack que no es
gratuita es la ingesta real. La mitigamos así: **todo el desarrollo y todos los
tests corren contra `mocks/x-api-mock/`**, un mock propio de la X Activity API
(webhooks, CRC, suscripciones) que ya está en el repo. La cuenta con créditos se
usa sólo para validaciones puntuales de Fase 0/1, no para desarrollo iterativo.

---

## 2. Costo estimado de la ingesta

Modelo vigente desde el 6 de febrero de 2026: *pay-per-use* por créditos
comprados por adelantado. Sin contrato, sin mínimo mensual, sin tier gratuito.

| Recurso | Costo unitario |
| --- | --- |
| Evento webhook `post.create` | USD 0,005 |
| `Posts: Read` | USD 0,005 |
| `User: Read` (resolución `handle → user_id`) | USD 0,010 |
| Evento webhook `post.delete` | No facturado |

### 2.1 Escenarios por volumen de cuentas monitoreadas

Supuesto: **40 posts/día por cuenta** en período activo, 30 días.

| Escenario | Cuentas | Eventos/mes | Costo eventos | `user_id` (única vez) | **Total mensual** |
| --- | --- | --- | --- | --- | --- |
| Mínimo (sólo cuentas núcleo) | 5 | 6.000 | USD 30 | USD 0,05 | **≈ USD 30** |
| **Objetivo del MVP** | **10** | **12.000** | **USD 60** | **USD 0,10** | **≈ USD 60** |
| Alcance del documento de investigación | 25 | 30.000 | USD 150 | USD 0,25 | **≈ USD 150** |
| Ampliado | 50 | 60.000 | USD 300 | USD 0,50 | **≈ USD 300** |

**Decisión de esta entrega:** arrancamos con el escenario de **10 cuentas**
(≈ USD 60/mes) — Trump, Vance, la Casa Blanca y las cuentas oficiales de mayor
impacto — y sólo ampliamos cuando el hit rate por tema lo justifique. El costo es
**lineal con el volumen de tuits**, y el volumen se dispara justo en una crisis,
que es cuando el bot más opera: por eso el `spending limit` por ciclo es
obligatorio, no opcional.

### 2.2 Factores que abaratan

- **Deduplicación de 24 h UTC**: pedir el mismo recurso dos veces el mismo día se
  cobra una vez (garantía "blanda", puede fallar en incidentes). Diseñamos para
  no re-leer un post ya entregado.
- **Créditos xAI de regreso**: 10% del gasto entre USD 200–499, 15% entre 500–999,
  20% desde USD 1.000. No aplica a nuestro escenario de USD 60/mes, y además
  nuestro clasificador corre sobre la API de Anthropic, no sobre Grok.
- **`post.delete` no se factura**: podemos suscribirnos para detectar borrados
  sin costo adicional.

### 2.3 Controles de gasto acordados

1. `spending limit` por ciclo de facturación configurado en la consola.
2. Auto-recharge **desactivado** o con tope, para que un pico de volumen no
   drene créditos en silencio.
3. Alerta cuando el consumo diario supera el promedio esperado.
4. Desarrollo contra el mock, no contra la API real.

---

## 3. Vía de ingesta elegida

### 3.1 Comparación

| Vía | Latencia | Disponibilidad | Filtro | Costo | Veredicto |
| --- | --- | --- | --- | --- | --- |
| **A. X Activity API + webhook** | Sub-segundo | Self-serve (1.000 suscripciones) | Por `user_id` | USD 0,005/evento | **Elegida** |
| A'. X Activity API + stream HTTP persistente | Sub-segundo | Self-serve | Por `user_id` | Igual | Fallback |
| B. Filtered Stream v2 | Sub-segundo | **Ambigua** en pay-per-use; 1 conexión concurrente | Por reglas/keywords | Igual | Plan B |
| C. Filtered Stream Webhooks | Sub-segundo | **Sólo Enterprise** | Reglas (25.000+) | Contrato negociado | Descartada |

### 3.2 Por qué la X Activity API

**El filtro coincide exactamente con el problema.** No queremos "todos los tuits
que mencionan a Trump" — queremos "los tuits que escribe Trump". XAA filtra por
`user_id`, que es literalmente la primitiva del caso de uso. El Filtered Stream
filtra por reglas de texto, lo que obliga a expresar lo mismo como
`from:realDonaldTrump -is:retweet` y arrastra el riesgo de que la regla matchee
de más o de menos.

**Es la única vía self-serve con latencia sub-segundo confirmada.** El Filtered
Stream Webhooks resolvería mejor las reconexiones, pero es Enterprise.

**`post.create` y `post.delete` son eventos públicos**: se suscriben indicando el
`user_id` en el filtro, sin OAuth del usuario objetivo. Eso es lo que hace viable
monitorear cuentas de terceros.

**El tier self-serve sobra**: 1.000 suscripciones contra las 10–25 que
necesitamos (una por cuenta y por tipo de evento).

### 3.3 Por qué webhook y no stream persistente

El webhook evita mantener una conexión viva y manejar reconexiones dentro del
proceso del backend, y permite `POST /2/webhooks/replay` para recuperar eventos
perdidos durante una caída. Como contrapartida obliga a cumplir un contrato
estricto, que es la causa más habitual de que un webhook quede inválido **en
silencio**:

| Requisito | Detalle |
| --- | --- |
| HTTPS | Obligatorio |
| Sin puerto en la URL | `https://midominio.com:5000/webhook` **no** funciona |
| Respuesta < 10 s | Ack rápido, procesamiento asíncrono |
| `200 OK` | Cualquier otra cosa cuenta como error |
| Soporte CRC | Responder los `GET` con HMAC-SHA256 del consumer secret |

El stream persistente queda como **fallback**: si se indica `webhook_id` en la
suscripción, el evento se entrega al webhook *además* del stream si éste está
abierto, así que las dos vías conviven sin duplicar suscripciones.

### 3.4 Consecuencias de diseño ya incorporadas al repo

- **La ventana de ack de X (10 s) es más corta que el análisis del post.** Por eso
  el backend responde `200` apenas persiste el post y dispara el análisis del
  agente en background (`docs/backend/agent.md`).
- **Verificación de firma `x-twitter-webhooks-signature` obligatoria.** Sin ella,
  cualquiera que conozca la URL puede inyectar un tuit falso y disparar una orden.
  Es el vector de ataque más obvio de toda la arquitectura.
- **`X_WEBHOOK_TARGET_URL` sin default seguro** en `.env.example`: la URL cambia
  por entorno (túnel HTTPS en dev, dominio real en producción) y X rechaza URLs
  con puerto.
- **Monitoreo de `GET /2/webhooks`**: un webhook marcado inválido deja de recibir
  eventos sin aviso — ceguera total del sistema.

### 3.5 Fuentes complementarias

`whitehouse.gov`, Federal Register API y RSS de agencias quedan como
**confirmación secundaria**, nunca como disparador primario: su latencia es mayor
que la de XAA. El módulo de scraping ya existente
(`backend/src/shared/services/webScraper.ts`) es la vía por la que entran.
Truth Social queda fuera de alcance por falta de API pública y por TOS.

---

## 4. Arquitectura general del pipeline

Seis etapas desacopladas. El desacople es deliberado: la ingesta nunca se bloquea
por lentitud del clasificador o del exchange, y permite reprocesar eventos.

```
X Activity API                                            Kalshi (demo)
      │                                                          ↑
      ↓                                                          │
┌───────────┐   ┌───────────────┐   ┌──────────────┐   ┌──────────┐   ┌──────────┐   ┌────────┐
│ 1 Ingesta │──>│ 2 Normaliz.   │──>│ 3 Clasific.  │──>│ 4 Match  │──>│ 5 Ejec.  │──>│ 6 Sal. │
│  webhook  │   │ dedupe + raw  │   │ agente LLM   │   │ tema→tkr │   │ riesgo   │   │ cierre │
└───────────┘   └───────────────┘   └──────────────┘   └──────────┘   └──────────┘   └────────┘
      │                 │                   │                 │              │             │
      └─────────────────┴───────────────────┴─── decision_log (auditable) ───┴─────────────┘
```

### 4.1 Etapas, tecnología y SLA

| # | Etapa | Responsabilidad | Tecnología elegida | Estado en el repo | SLA |
| --- | --- | --- | --- | --- | --- |
| 1 | **Ingesta** | Recibir `post.create` de cuentas monitoreadas, verificar CRC y firma, ack < 10 s | **Express + TypeScript** (`modules/ingestion`) | Implementado (contra mock) | < 1 s |
| 2 | **Normalización** | Deduplicar, extraer texto/URLs/entidades, persistir crudo | **PostgreSQL** + **Redis** | Implementado | < 50 ms |
| 3 | **Clasificación** | Tema, dirección, relevancia, novedad, confianza | **Anthropic API** (`claude-sonnet-5`) + reglas + scraping de links (`modules/agent`) | Implementado, dry-run | < 2 s |
| 4 | **Matching** | Tema → tags → series → tickers de Kalshi | Tabla de mapeo en memoria + caché de mercados en Redis; embeddings sólo como desempate | Pendiente — Fase 2 | < 200 ms |
| 5 | **Ejecución** | Validar riesgo y enviar la orden firmada | Cliente Kalshi REST propio (RSA-PSS) sobre el `openapi.yaml` | Pendiente — Fase 4 | < 300 ms |
| 6 | **Salida** | Cerrar por tiempo, convergencia, stop/take profit | Scheduler + WebSocket de fills de Kalshi | Pendiente — Fase 4 | según política |

**Desvío consciente respecto del documento de investigación.** La investigación
proponía Python + FastAPI para el receptor de webhook. El proyecto se implementó
en **Node + Express + TypeScript**, por tres razones: (a) unifica el lenguaje con
el frontend React/Vite y con las migraciones knex, así que hay un solo toolchain
y un solo set de tipos; (b) el modelo `async` de Node cumple igual el requisito de
ack < 10 s sin bloquear; (c) el SDK de Anthropic y el `kalshi-typescript` existen
en TS, así que no perdemos cliente generado. El resto del stack propuesto
(PostgreSQL, Redis, contenedores) se mantiene.

Del mismo modo, el dashboard es **React + Vite** en lugar de Streamlit: el
proyecto ya tiene el SPA con autenticación JWT y la página de cuentas
monitoreadas funcionando, así que no hay razón para introducir un segundo stack
de UI sólo para el MVP.

### 4.2 Componentes transversales

| Componente | Tecnología | Para qué |
| --- | --- | --- |
| Cola / desacople | Redis | Ingesta no se bloquea por el clasificador; permite replay |
| Caché de scraping | Redis (`SCRAPE_CACHE_TTL_SECONDS`) | Una página linkeada se baja una vez, la comparten el pipeline y el agente |
| Log de decisiones | PostgreSQL (`decision_log`) | Cada post procesado deja rastro, opere o no |
| Secretos | Variables de entorno / gestor de secretos | La clave privada de Kalshi no se recupera si se pierde |
| Kill switch | Flag en backend + botón en dashboard | Detener todo y cancelar órdenes abiertas |
| `DRY_RUN` | Variable de entorno, hoy en `true` | Pipeline completo sin enviar órdenes |

### 4.3 Idempotencia y seguridad, de entrada

- **`client_order_id` único por orden** — un timeout de red no debe producir una
  posición duplicada.
- **Guard SSRF en el scraper** antes de cualquier request: el texto de un post es
  input no confiable y no puede apuntar el backend a infraestructura interna
  (loopback, RFC1918, link-local, `169.254.169.254`).
- **Verificación de firma del webhook** antes de procesar cualquier evento.
- **Errores nunca exponen internals** al cliente: la política de errores está
  centralizada en el middleware del backend.

---

## 5. Taxonomía inicial de temas

Regla que gobierna la lista: **un tema sin mercado líquido en Kalshi es ruido.**
Arrancamos corto — cuatro temas núcleo más dos en observación — y cada uno debe
mapear a series de Kalshi que existan de verdad y tengan volumen.

### 5.1 Temas núcleo

| # | Tema (`slug`) | Disparador típico | Dirección modelada | Categoría / tags candidatos de Kalshi |
| --- | --- | --- | --- | --- |
| 1 | `aranceles_comercio` | Anuncio o amenaza de tarifas a un país; suspensión o tregua comercial | `escalada` / `distension` / `neutro` | Categoría *Economics* / *Politics*; tags candidatos: `Tariffs`, `Trade`, `Inflation` |
| 2 | `politica_monetaria_fed` | Presión pública sobre la Fed o su presidente; comentario sobre tasas | `hawkish` / `dovish` / `neutro` | Categoría *Economics*; tags candidatos: `Fed`, `Interest Rates`, `Inflation` |
| 3 | `shutdown_presupuesto` | Amenaza de cierre de gobierno; veto o acuerdo presupuestario | `mas_probable` / `menos_probable` | Categoría *Politics*; tags candidatos: `Government Shutdown`, `Congress` |
| 4 | `conflictos_internacionales` | Amenaza militar, alto el fuego, retiro de tropas, sanciones | `escalada` / `distension` | Categoría *World*; tags candidatos: `Geopolitics`, `Ukraine`, `Middle East` |

### 5.2 Temas en observación (fuera del MVP)

| Tema | Por qué no entra todavía |
| --- | --- |
| `nominaciones_personal` | Mercados de confirmación/permanencia existen pero suelen ser delgados; alta ambigüedad semántica |
| `crypto_regulacion` | Mercados líquidos, pero el precio reacciona más al mercado spot que al tuit — la señal se solapa con ruido de mercado |
| `inmigracion` | Muchos anuncios son retóricos y no cambian la probabilidad del evento subyacente |

### 5.3 Cómo se valida el mapeo (Fase 2)

Los tags de la columna derecha son **hipótesis**, no valores confirmados: Kalshi
usa un vocabulario controlado propio y hay que leerlo, no adivinarlo.

1. `GET /search/tags_by_categories` — obtener el vocabulario **real** de tags por
   categoría. Se refresca a diario.
2. Escribir a mano la tabla `tema → tags` y hacerla revisar por una persona. Es la
   pieza de mayor apalancamiento del sistema: un mapeo malo hace que todo el resto
   opere sobre el mercado equivocado.
3. `GET /series?tags=<tags>&include_volume=true` — descartar de entrada las series
   ilíquidas.
4. `GET /markets?series_ticker=<ticker>&status=open&limit=1000` — mercados
   operables, cacheados.
5. Refresco incremental con `min_updated_ts`, no recorriendo todo el catálogo.
6. El índice semántico (embeddings sobre `title`, `yes_sub_title`,
   `rules_primary`) queda como **desempate** dentro del conjunto ya filtrado por
   tags — nunca como buscador global en el camino crítico de la orden.

**Trampa documentada:** el parámetro `tags` se separa **sólo por comas**. Un tag
con espacios como `Rotten Tomatoes` funciona tal cual; si el código lo splitea
por espacios, no matchea nada.

### 5.4 Salida esperada del clasificador

```json
{
  "post_id": "1846...",
  "author": "realDonaldTrump",
  "tema": "aranceles_comercio",
  "relevancia": 0.91,
  "direccion": "escalada",
  "entidades": ["China", "aranceles", "60%"],
  "es_novedad": true,
  "confianza": 0.84,
  "latencia_ms": 1450
}
```

`tema` debe pertenecer a la taxonomía cerrada. Por debajo del umbral de
confianza se registra en `decision_log` pero **no se opera**: el log de las
decisiones no tomadas vale tanto como el de las tomadas para calibrar.

**Riesgo de diseño que ya está incorporado:** la variable relevante **no es el
sentimiento** sino el cambio en la probabilidad del evento. Un tuit furioso puede
ser alcista para un mercado y bajista para otro. Por eso la dirección se modela
**por tema**, nunca como un score global.

---

## 6. Restricción económica que condiciona la estrategia

No es parte de lo pedido, pero es la conclusión de Fase 0 que más afecta lo que
viene, así que queda registrada.

El fee taker de Kalshi es `round_up_al_centavo(0.07 × C × P × (1 − P))` — una
parábola con máximo en 50¢:

| Precio | Fee por contrato | % del valor |
| --- | --- | --- |
| 50¢ | 1,75¢ | 3,50% |
| 40¢ / 60¢ | 1,68¢ | ≈ 3,4% |
| 10¢ / 90¢ | 0,63¢ | ≈ 1,3% |

**Un round trip paga el fee dos veces.** A 50¢ eso es ~3,5% del nocional sólo en
comisiones, antes del spread: la señal política tiene que mover el precio **más
de 3,5 centavos** para que la operación tenga sentido. Mantener hasta el
settlement es gratis del lado de la salida; salir antes por precio no lo es.

Consecuencias para el diseño del motor de salida (Fase 4):

- El bot lee `fee_type` y `fee_multiplier` de `GET /series` y calcula el fee
  exacto antes de decidir — no asume `0.07`.
- Consultar `GET /series/fee_changes`: un cambio programado puede volver inviable
  una estrategia marginal de un día para el otro.
- Preferir mercados en los extremos de precio, donde el fee relativo cae.
- Evaluar mantener hasta settlement cuando la salida temporizada no supere el
  umbral de fees.

---

## 7. Estado del trabajo y git

El historial refleja trabajo real del grupo con **Conventional Commits**
(`feat`, `fix`, `docs`, `chore`, `test`, `refactor`, `ci`), en inglés, según la
regla del proyecto.

| Bloque | Commits representativos | Estado |
| --- | --- | --- |
| Scaffolding del monorepo | `chore: scaffold project monorepo with backend, frontend, database, and tests` | Listo |
| Autenticación | `feat(auth): add admin JWT authentication`, `test(auth): add login endpoint integration tests` | Listo |
| Ingesta / webhook de X | `feat: create xWebhook`, `feat(ingestion): add monitored accounts management` | Listo |
| Frontend / dashboard | `feat(frontend): add auth flow and dashboard shell`, `feat(frontend): add monitored accounts page` | Listo |
| Scraping de links | `feat(scraping): add scrape cache service with Redis client and scraped page repository` | Listo |
| Agente clasificador | `feat(agent): add agent module, decision log constants, and docs` | Listo |
| Infraestructura y mocks | `ci(infra): update docker-compose, add anthropic mock, update tests and docs` | Listo |

Documentación de módulos ya en el repo: `docs/backend/{auth,ingestion,agent,decisionPipeline}.md`,
`docs/frontend/`, `docs/infrastructure/`, `docs/testing/`.

---

## 8. Próximos pasos (Fase 1 — Ingesta)

| # | Tarea | Criterio de salida |
| --- | --- | --- |
| 1 | Confirmar en la consola los endpoints marcados como pendientes en §1.1 | Estado documentado, sin ambigüedades |
| 2 | Smoke test firmado contra Kalshi demo (`GET /portfolio/balance`) | `200` con la clave real |
| 3 | Exponer el webhook por HTTPS y superar el CRC contra la X API real | Webhook en estado válido en `GET /2/webhooks` |
| 4 | Crear las suscripciones `post.create` de las 10 cuentas núcleo | `total_subscriptions` = 10 |
| 5 | Instrumentar latencia de ingesta (p50/p95/p99) | p95 < 2 s durante 7 días |
| 6 | Monitoreo de webhook inválido + alerta | Alerta disparando en una prueba forzada |

---

## 9. Riesgos abiertos al cierre de esta entrega

| Riesgo | Impacto | Mitigación |
| --- | --- | --- |
| El volumen de tuits se dispara en una crisis y el costo se va de escala | Créditos agotados justo cuando el bot más opera | `spending limit` por ciclo + alertas de consumo diario |
| Webhook marcado inválido sin aviso | Ceguera total del sistema | Monitorear `GET /2/webhooks`; `replay job` para recuperar |
| Tuit falso inyectado en el webhook | Orden por señal falsa | Verificar `x-twitter-webhooks-signature` siempre |
| Mercados políticos delgados en Kalshi | El spread se come la señal | Filtrar series por `include_volume` antes de operar |
| Fees > movimiento del precio | Estrategia inviable aun acertando la dirección | Umbral mínimo de movimiento esperado por tema (§6) |
| X cambia precios o accesos otra vez | Costos o diseño rotos | El modelo cambió dos veces en 2026; revisar la consola periódicamente |
| Elegibilidad geográfica para operar en Kalshi | Invalida la fase de producción | Verificar antes de invertir tiempo en Fase 5 |

Este documento no constituye asesoramiento legal ni financiero. Todo el desarrollo
corre contra el entorno **demo** de Kalshi, sin capital real.
