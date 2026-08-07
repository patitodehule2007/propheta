# **BOT DE TRADING SOBRE SEÑALES POLÍTICAS**

Investigación técnica de APIs, endpoints y webhooks

Pipeline: X (Twitter) API → NLP / clasificación de temas → Kalshi API _Documento de arquitectura y especificación técnica — v1.0_

Fecha de elaboración: 17 de julio de 2026 Datos verificados contra documentación oficial de docs.x.com y docs.kalshi.com

## **1. Resumen ejecutivo**

El proyecto consiste en un sistema de trading algorítmico que monitorea en tiempo real las declaraciones de figuras políticas de alto impacto (Donald Trump, JD Vance, la Casa Blanca y otras cuentas oficiales), determina si el contenido se relaciona con alguno de los temas predefinidos en los que el sistema tiene mandato para operar, busca en Kalshi los mercados de predicción vinculados a ese tema, ejecuta una orden de compra y liquida la posición transcurrido un tiempo determinado.

La tesis operativa es sencilla: los mercados de eventos de Kalshi repricean tras declaraciones políticas relevantes, y existe una ventana de latencia entre la publicación del tuit y el ajuste completo del precio. El bot busca capturar esa ventana.

### **1.1 Conclusiones principales de la investigación**

- Ruta de ingesta recomendada: X Activity API (XAA) con evento post.create filtrado por user_id, entregado vía webhook o stream HTTP persistente. Es la única vía self-serve con latencia sub-segundo y sin necesidad de contrato Enterprise.

- El Filtered Stream v2 clásico (GET /2/tweets/search/stream) sigue existiendo, pero su disponibilidad por plan es ambigua en 2026 y las fuentes de terceros se contradicen; conviene validarlo en la Developer Console antes de diseñar en torno a él.

- X pasó a modelo pay-per-use en febrero de 2026: no hay tier gratuito para nuevos desarrolladores. Cada Post leído/entregado cuesta USD 0,005, con tope de 2.000.000 de lecturas mensuales.

- Kalshi expone REST + WebSocket + FIX. La autenticación es RSA-PSS (no HMAC, no PKCS#1 v1.5) sobre el mensaje timestamp + MÉTODO + path.

- Kalshi NO ofrece webhooks: la vía push es el WebSocket autenticado.

- El descubrimiento de mercados tiene filtros ricos (status, series_ticker, event_ticker, tickers, filtros de timestamp, mve_filter) y, sobre todo, un vocabulario controlado de tags por categoría: GET /search/tags_by_categories + GET /series?tags=. Ese es el eje del matching tuit → mercado, mucho más barato y determinístico que embeddings puros. Lo que no existe es un endpoint de búsqueda por texto libre.

- El límite duro del diseño no es técnico sino económico: cada round trip (comprar y vender) paga fee de trading dos veces. A 50¢ el fee taker es 1,75% por lado ⇒ ~3,5% de ida y vuelta. La señal debe mover el precio más que eso para ser rentable.

> Aviso: este documento es una especificación técnica, no asesoramiento financiero ni legal. Kalshi es un exchange regulado por la CFTC con restricciones jurisdiccionales; antes de operar con dinero real, verificar elegibilidad, términos del Developer Agreement y normativa aplicable en tu país de residencia.

## **2. Arquitectura del sistema**

### **2.1 Pipeline end-to-end**

El sistema se descompone en seis etapas, cada una desacoplada de la siguiente mediante una cola de mensajes. El desacople es deliberado: permite que la ingesta nunca se bloquee por lentitud del NLP o del exchange, y permite reprocesar eventos ante fallos.

| **#** | **Etapa**     | **Responsabilidad**                               | **Tecnología sugerida**                     | **SLA**       |
| ----- | ------------- | ------------------------------------------------- | ------------------------------------------- | ------------- |
| 1     | Ingesta       | Recibir post.create de las cuentasmonitoreadas    | Webhook HTTPS (FastAPI) ostream persistente | < 1 s         |
| 2     | Normalización | Deduplicar, extraer texto/entdades,persistr crudo | Redis + PostgreSQL                          | < 50 ms       |
| 3     | Clasifcación  | Determinar tema, relevancia,dirección y confanza  | LLM + reglas + modelo desentmiento          | < 2 s         |
| 4     | Matching      | Encontrar mercados Kalshi ligados altema          | Índice vectorial local de mercadosabiertos  | < 200 ms      |
| 5     | Ejecución     | Validar riesgo y enviar la orden                  | Kalshi REST (RSA-PSS)                       | < 300 ms      |
| 6     | Salida        | Cerrar posición tras X tempo / stop /take proft   | Scheduler + WebSocket de flls               | según polítca |

## **3. Módulo de ingesta: X (Twitter) API**

### **3.1 Estado del acceso a la API en 2026**

Este es el punto que más cambió respecto de cualquier tutorial anterior y condiciona todo el presupuesto del proyecto. El 6 de febrero de 2026 X reemplazó los planes por suscripción por un modelo pay-per-use basado en

créditos: se compran créditos por adelantado en la Developer Console y cada request los descuenta. No existe contrato, ni mínimo mensual, ni tier gratuito general para nuevos desarrolladores.

- Los planes legacy Basic (USD 200/mes) y Pro (USD 5.000/mes) quedaron cerrados a nuevas altas; sólo siguen vigentes para suscriptores previos.

- Enterprise se mantiene como vía separada (negociada con ventas) para volumen alto.

- Los precios por endpoint se publican en la Developer Console y la documentación advierte explícitamente que están sujetos a cambio.

#### **Tarifas vigentes (fuente: docs.x.com/x-api/getting-started/pricing)**

| **Recurso / acción**       | **Costo unitario**    | **Relevancia para el proyecto**          |
| -------------------------- | --------------------- | ---------------------------------------- |
| Posts: Read                | USD 0,005 por recurso | Cada tuit leído o entregado              |
| User: Read                 | USD 0,010 por recurso | Resolución de handle → user_id (una vez) |
| Evento webhook post.create | USD 0,005 por evento  | Vía de ingesta principal                 |
| Evento webhook post.delete | No facturado          | Útl para detectar borrados               |
| Evento webhook news.new    | USD 0,005 por evento  | Sólo Enterprise/Partner                  |
| Post: Create               | USD 0,015 por request | No aplica (el bot no publica)            |

Dos mecanismos abaratan la operación y conviene tenerlos en cuenta al modelar costos:

- Deduplicación: todos los recursos se deduplican dentro de una ventana de 24 h UTC. Pedir el mismo Post dos veces el mismo día se cobra una sola vez. La documentación aclara que es una garantía «blanda» (puede fallar en incidentes).

- Créditos xAI de regreso: al comprar créditos de X API se obtienen créditos gratuitos de la API de xAI según el gasto acumulado en el ciclo — 0% hasta USD 199, 10% entre 200 y 499, 15% entre 500 y 999, y 20% desde USD 1.000. Requiere vincular el equipo de xAI a la cuenta de desarrollador. Si el clasificador NLP corriera sobre Grok, esto compensa parte del gasto.

- Controles de gasto: la consola permite auto-recharge (con tope de una recarga cada 5 minutos, pausada si el saldo es cero o negativo) y un spending limit por ciclo de facturación.

### **3.2 Opción A (recomendada): X Activity API — XAA**

La X Activity API permite suscribirse a eventos de la plataforma filtrando por el user_id de la cuenta que interesa, con entrega de latencia sub-segundo. Es exactamente la primitiva que necesita este proyecto: no queremos «todos los tuits que mencionan a Trump», queremos «los tuits que escribe Trump».

#### **Tipos de evento relevantes**

| **Evento**                | **Se dispara cuando**              | **Filtro**        | **Privacidad**          |
| ------------------------- | ---------------------------------- | ----------------- | ----------------------- |
| post.create               | Un usuario publica un Post         | user_id           | Público                 |
| post.delete               | Un usuario borra un Post           | user_id           | Público                 |
| profle.update.bio         | Cambia la bio del perfl            | user_id           | Público                 |
| profle.update.handle      | Cambia el handle                   | user_id           | Público                 |
| like.create               | Un usuario da o recibe un like     | user_id, directon | Privado (OAuth 2.0)     |
| news.new                  | Nuevas tendencias curadas por Grok | keyword           | Sólo Enterprise/Partner |
| spaces.start / spaces.end | Inicio/fn de un Space              | user_id           | Público                 |

post.create y post.delete son eventos públicos: se pueden suscribir indicando el user_id en el filtro, sin OAuth del usuario objetivo. Esto es lo que hace viable monitorear cuentas de terceros como @realDonaldTrump o @WhiteHouse.

#### **Mecanismos de entrega**

- Stream HTTP persistente: GET https://api.x.com/2/activity/stream

- Webhook: se indica el webhook_id opcional al crear la suscripción. Si hay webhook_id, el evento se entrega al webhook además del stream si éste está abierto.

#### **Límites de suscripciones por tier**

| **Tier de paquete** | **Máximo de suscripciones** |
| ------------------- | --------------------------- |
| Self-serve          | 1.000                       |
| Enterprise          | 50.000                      |
| Partner             | 100.000                     |

Para este proyecto, con 20–50 cuentas monitoreadas, el tier self-serve sobra: cada cuenta consume una suscripción por tipo de evento.

#### **Endpoints de XAA**

| **Método** | **Endpoint**                      | **Descripción**                    |
| ---------- | --------------------------------- | ---------------------------------- |
| GET        | /2/actvity/stream                 | Conectarse al stream de actvidad   |
| POST       | /2/actvity/subscriptons           | Crear una suscripción              |
| GET        | /2/actvity/subscriptons           | Listar suscripciones               |
| PUT        | /2/actvity/subscriptons/:id       | Actualizar (sólo tag y webhook_id) |
| DELETE     | /2/actvity/subscriptons/:id       | Eliminar una suscripción           |
| DELETE     | /2/actvity/subscriptons (por IDs) | Eliminar varias suscripciones      |

Cambiar el filter o el event_type de una suscripción existente no es posible vía PUT: hay que borrar la suscripción y crear una nueva. El PUT sólo sirve para cambiar el tag o el método de entrega.

#### **Flujo de implementación en 3 pasos**

Paso 1 — Resolver el user_id de cada cuenta objetivo (se hace una sola vez y se cachea):

```sh
curl -H "Authorization: Bearer $BEARER_TOKEN" \ "https://api.x.com/2/users/by/username/realDonaldTrump"

# Respuesta:

# { "data": { "id": "25073877", "name": "...", "username": "..." } }
```

Paso 2 — Crear la suscripción a post.create para ese user_id, apuntando al webhook:

```sh
curl -H "Authorization: Bearer $BEARER_TOKEN" \ -X POST https://api.x.com/2/activity/subscriptions \ -H "Content-Type: application/json" \ -d '{ "event_type": "post.create", "flter": { "user_id": "25073877" }, "tag": "trump-posts", "webhook_id": "1976325569252868099" }'
# Respuesta 200:
# {
#   "data": {
#     "subscription_id": "1976325569252868096",
#     "event_type": "post.create",
#     "flter": { "user_id": "25073877" },
#     "tag": "trump-posts",
#     "webhook_id": "1976325569252868099",
#     "created_at": "2026-07-17T16:35:08.000Z"
#   },
#   "meta": { "total_subscriptions": 1 }
# }
```

Paso 3 — Recibir los eventos. Con stream persistente:

```sh
curl -H "Authorization: Bearer $BEARER_TOKEN" \ https://api.x.com/2/activity/stream
```

La autenticación de todos los endpoints de XAA se hace con el Bearer Token de la app (OAuth 2.0 App-Only), salvo los eventos privados como like.create, que exigen contexto de usuario.

### **3.3 Opción B: Filtered Stream v2**

El Filtered Stream es la alternativa cuando se necesita filtrado por palabras clave, lógica booleana, geo, idioma o cualquier otro operador que XAA no soporta. Funciona en dos tiempos: se cargan reglas por REST y luego se abre una conexión persistente que entrega sólo los Posts que las cumplen. No hace falta desconectarse para agregar o quitar reglas.

| **Método** | **Endpoint**                  | **Uso**                                          |
| ---------- | ----------------------------- | ------------------------------------------------ |
| POST       | /2/tweets/search/stream/rules | Agregar o borrar reglas (soporta dry_run)        |
| GET        | /2/tweets/search/stream/rules | Listar reglas actvas (máx. 1.000 por página)     |
| GET        | /2/tweets/search/stream       | Abrir el stream y recibir los Posts que matchean |

Restricciones operativas conocidas: 1 conexión concurrente, límite de reglas por proyecto y longitud máxima de regla dependientes del nivel de acceso. Los operadores son case-insensitive; los acentos en las reglas del Filtered Stream sí discriminan (diacrítica no matchea diacritica), a diferencia de la búsqueda.

Punto a verificar antes de decidir: las fuentes de terceros se contradicen sobre si el Filtered Stream v2 está disponible en pay-per-use o si quedó restringido a Pro/Enterprise. La documentación oficial no lo aclara de forma inequívoca en las páginas consultadas. Confirmar el acceso real desde la Developer Console con la cuenta del proyecto antes de comprometer el diseño.

Ejemplo de regla para el caso de uso, si se optara por esta vía:

```json
{
  "add": [
    { "value": "from:realDonaldTrump -is:retweet", "tag": "trump" },
    { "value": "from:WhiteHouse OR from:PressSec", "tag": "casa-blanca" },
    { "value": "from:JDVance -is:reply", "tag": "vance" }
  ]
}
```

### **3.4 Opción C: Filtered Stream Webhooks**

Variante del Filtered Stream en la que, en lugar de mantener una conexión persistente, se registra un webhook y X entrega los Posts que matchean las reglas. Elimina el manejo de desconexiones por caídas del cliente o reinicios del servidor.

- Disponible únicamente para desarrolladores Enterprise.

- Soporta más de 25.000 reglas por proyecto.

- Permite todos los operadores y reglas de hasta 2.048 caracteres.

- La documentación advierte que puede entregar cientos de eventos por segundo, por lo que el servidor debe soportar conexiones simultáneas.

Para este proyecto queda descartada por costo, salvo que se escale a producción con volumen alto.

### **3.5 API de Webhooks V2: requisitos y seguridad**

Si se elige entrega por webhook (recomendado para XAA), hay que cumplir un contrato estricto. Estos requisitos son la causa más habitual de que un webhook quede marcado como inválido y deje de recibir eventos silenciosamente.

| **Requisito**          | **Detalle**                                     |
| ---------------------- | ----------------------------------------------- |
| HTTPS                  | La URL del webhook debe usar HTTPS              |
| Accesible públicamente | Debe ser alcanzable desde internet              |
| Sin puerto en la URL   | htps://midominio.com:5000/webhook NO funciona   |
| Respuesta rápida       | Responder dentro de los 10 segundos             |
| 200 OK                 | Devolver status 200 para acusar recibo          |
| Soporte CRC            | Responder a los GET de Challenge-Response Check |

#### **Endpoints de gestión de webhooks**

| **Método** | **Endpoint**            | **Descripción**                                  |
| ---------- | ----------------------- | ------------------------------------------------ |
| POST       | /2/webhooks             | Registrar un webhook nuevo                       |
| GET        | /2/webhooks             | Listar webhooks y su estado válido/inválido      |
| DELETE     | /2/webhooks/:webhook_id | Eliminar un webhook                              |
| PUT        | /2/webhooks/:webhook_id | Disparar CRC y reactvar un webhook               |
| POST       | /2/webhooks/replay      | Crear un replay job (recuperar eventos perdidos) |

Todos requieren autenticación OAuth2 App-Only (Bearer Token).

#### **Challenge-Response Check (CRC)**

X envía GET periódicos a la URL del webhook; hay que responder con un hash HMAC-SHA256 calculado con el consumer secret de la app, demostrando control del endpoint. Cadencia:

- Inmediatamente al crear el webhook.

- Ante un PUT /2/webhooks/{id} explícito.

- Cada 30 minutos, pero sólo si el webhook no se validó con éxito en las últimas 24 h.

Un webhook se marca como inválido si devuelve 2XX con response_token incorrecto, si devuelve 3XX, si hay excepción SSL, o si acumula errores transitorios (4XX, 5XX, timeout, canal cerrado) durante más de 28 horas — incluye 4 h de gracia.

#### **Verificación de firma**

Cada POST entrante de X incluye el header x-twitter-webhooks-signature. Verificarlo es obligatorio en producción: sin esa verificación, cualquiera que conozca la URL puede inyectar un tuit falso y disparar una orden real. Es el vector de ataque más obvio de toda la arquitectura.

### **3.6 Estimación de costos de ingesta**

Supuestos: 25 cuentas monitoreadas, promedio de 40 posts/día por cuenta en períodos activos.

| **Concepto**              | **Cálculo**                                | **Costo mensual** |
| ------------------------- | ------------------------------------------ | ----------------- |
| Eventos post.create       | 25 × 40 × 30 = 30.000 eventos × USD 0,005  | ≈ USD 150         |
| Resolución de user_id     | 25 × USD 0,010 (una única vez)             | ≈ USD 0,25        |
| Enriquecimiento adicional | Opcional; evitar re-lecturas (dedupe 24 h) | USD 0             |
| Total ingesta estmado     | —                                          | ≈ USD 150 / mes   |

El orden de magnitud es cómodo, pero es lineal con el volumen de tuits. En una crisis internacional el volumen se dispara justo cuando el bot más opera. Configurar un spending limit por ciclo y alertas, no sólo auto-recharge.

### **3.7 Fuentes complementarias (no-X)**

El alcance del proyecto menciona comunicados oficiales y RSS. Estas fuentes son gratuitas y, en varios casos, se adelantan al tuit:

| **Fuente**               | **Mecanismo**           | **Nota**                                                             |
| ------------------------ | ----------------------- | -------------------------------------------------------------------- |
| whitehouse.gov/news      | Scraping / RSS          | Presidental Actons y órdenes ejecutvas                               |
| Federal Register API     | REST pública y gratuita | Documentos ofciales, con delay editorial                             |
| Truth Social             | Sin API pública ofcial  | Muchos anuncios aparecen acá primero; requierescraping — evaluar TOS |
| Reuters / AP / Bloomberg | RSS o feeds licenciados | Confrmación cruzada de eventos                                       |
| Congress.gov API         | REST pública            | Estado de votaciones y proyectos                                     |

Recomendación: usar estas fuentes como confirmación secundaria y para reducir falsos positivos, no como disparador primario — su latencia es mayor que la de XAA.

## **4. Módulo de procesamiento (NLP)**

### **4.1 Del tuit a una decisión**

El módulo recibe el texto del post y debe producir una estructura accionable. El diseño más robusto no es «análisis de sentimiento» genérico sino una clasificación contra una taxonomía cerrada de temas, definida de antemano, en la que el sistema tiene permiso para operar.

Salida esperada del clasificador:

```json
{
  "post_id": "1846...",
  "author": "realDonaldTrump",
  "tema": "aranceles_china", // debe pertenecer a la taxonomía cerrada
  "relevancia": 0.91, // ¿es una declaración de política real?
  "direccion": "escalada", // escalada | distension | neutro
  "entidades": ["China", "aranceles", "60%"],
  "es_novedad": true, // ¿aporta información nueva vs. su postura previa?
  "confianza": 0.84,
  "latencia_ms": 1450
}
```

### **4.2 Taxonomía de temas propuesta**

La lista debe ser corta al inicio y cada tema debe mapear a mercados Kalshi que existan de verdad y tengan liquidez. Un tema sin mercado líquido es ruido.

| **Tema**                  | **Ejemplo de disparador**                    | **Familia de mercados Kalshi**             |
| ------------------------- | -------------------------------------------- | ------------------------------------------ |
| Aranceles / comercio      | Anuncio de tarifas a un país                 | Polítca comercial, infación                |
| Nominaciones y personal   | Despido o nombramiento de un funcionario     | Confrmaciones, permanencia en el cargo     |
| Polítca monetaria / Fed   | Presión pública sobre la Fed o su presidente | Decisiones de tasas, permanencia del chair |
| Confictos internacionales | Amenaza militar, alto el fuego               | Geopolítca, acuerdos de paz                |
| Shutdown / presupuesto    | Amenaza de cierre de gobierno                | Government shutdown                        |
| Crypto y regulación       | Anuncio de reserva o de regulación           | Precio de actvos, aprobación regulatoria   |
| Inmigración               | Anuncio de deportaciones o de una orden      | Cifras y órdenes ejecutvas                 |

### **4.3 Arquitectura del clasificador**

1. Filtro barato primero: regex y keywords sobre la taxonomía. Descarta el 80% de los posts sin costo de inferencia y sin latencia.

2. Clasificador LLM: llamada a un modelo con un prompt que devuelve JSON estricto contra la taxonomía cerrada. Ventaja clave: entiende la ironía, la negación y el contexto, donde un modelo de sentimiento entrenado en reseñas fracasa.

3. Detector de novedad: comparar contra un embedding de las últimas N declaraciones del mismo autor sobre el mismo tema. Trump repitiendo por décima vez una postura conocida no mueve mercado; el mercado ya lo tiene precificado.

4. Umbral de confianza: por debajo de un umbral, se registra pero no se opera. El log de decisiones no tomadas es tan valioso como el de las tomadas para calibrar.

Riesgo crítico del módulo: el sentimiento no es la variable relevante. Lo que importa es el cambio en la probabilidad del evento, no si el tuit es «positivo» o «negativo». Un tuit furioso puede ser bullish para un mercado y bearish para otro. Modelar la dirección por tema, nunca un score global.

## **5. Módulo de ejecución: Kalshi API**

### **5.1 Entornos y URLs base**

Kalshi mantiene dos entornos completamente separados: las credenciales no se comparten entre ellos. Una API key de demo sólo funciona contra endpoints de demo, y viceversa. Todo desarrollo debe hacerse contra demo.

| **Entorno** | **REST (recomendado)**                               | **También soportado**                         |
| ----------- | ---------------------------------------------------- | --------------------------------------------- |
| Producción  | htps://external-api.kalshi.com/trade-api/v2          | htps://api.electons.kalshi.com/trade-api/v2   |
| Demo        | htps://external-api.demo.kalshi.co/trade-api/v2      | htps://demo-api.kalshi.co/trade-api/v2        |
| **Entorno** | **WebSocket (recomendado)**                          | **También soportado**                         |
| Producción  | wss://external-api-ws.kalshi.com/trade-api/ws/v2     | wss://api.electons.kalshi.com/trade-api/ws/v2 |
| Demo        | wss://external-api-ws.demo.kalshi.co/trade-api/ws/v2 | wss://demo-api.kalshi.co/trade-api/ws/v2      |

A pesar del subdominio «elections», la Trade API de producción da acceso a todos los mercados de Kalshi, no sólo los electorales. Los hosts external-api son los dedicados a la API externa y los recomendados para traders programáticos.

### **5.2 Autenticación: firma RSA-PSS**

Kalshi no usa API key en un header ni HMAC: usa firma asimétrica. El flujo de alta es:

1. Entrar a la cuenta (demo.kalshi.co o kalshi.com) → Account & security → API Keys → Create Key.

2. Guardar la clave privada (archivo .key descargado) y el API Key ID (formato UUID). La clave privada NO se puede recuperar después de cerrar esa pantalla.

3. Firmar cada request autenticado y adjuntar tres headers.

| **Header**              | **Contenido**                                            |
| ----------------------- | -------------------------------------------------------- |
| KALSHI-ACCESS-KEY       | El API Key ID (ej. a952bcbe-ec3b-4b5b-b8f9-11dae589608c) |
| KALSHI-ACCESS-TIMESTAMP | Hora actual en milisegundos (ej. 1703123456789)          |
| KALSHI-ACCESS-SIGNATURE | Firma RSA-PSS en base64                                  |

Construcción del mensaje a firmar: concatenación ASCII de timestamp + MÉTODO_HTTP + path.

```
1703123456789GET/trade-api/v2/portfolio/balance
```

Reglas que rompen la firma si se ignoran:

- El timestamp va en milisegundos, no en segundos. Es la causa nº1 de 401.

- El path debe incluir el prefijo /trade-api/v2 y debe excluir el query string. Para https://externalapi.kalshi.com/trade-api/v2/portfolio/orders?limit=5 se firma /trade-api/v2/portfolio/orders.

- El host NO forma parte del payload de la firma: los cuatro hosts firman el mismo path.

- Es RSA-PSS con MGF1(SHA-256) y salt igual al largo del digest (32 bytes) — no PKCS#1 v1.5.

- El reloj de la máquina debe estar sincronizado por NTP: la deriva de reloj devuelve el mismo 401 opaco que una clave equivocada.

Implementación de referencia (Python, publicada por Kalshi):

```py
import base64, datetime, requests
from urllib.parse import urlparse
from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives.asymmetric import padding

API_KEY_ID = "your-api-key-id-here"
PRIVATE_KEY_PATH = "path/to/your/kalshi-key.key"
BASE_URL = "https://external-api.demo.kalshi.co/trade-api/v2"

def load_private_key(key_path):
    with open(key_path, "rb") as f:
        return serialization.load_pem_private_key(
            f.read(), password=None, backend=default_backend())

def create_signature(private_key, timestamp, method, path):
    path_without_query = path.split("?")[0]
    message = f"{timestamp}{method}{path_without_query}".encode("utf-8")
    signature = private_key.sign(
        message,
        padding.PSS(mgf=padding.MGF1(hashes.SHA256()),
                    salt_length=padding.PSS.DIGEST_LENGTH),
        hashes.SHA256())
    return base64.b64encode(signature).decode("utf-8")

def get(private_key, api_key_id, path, base_url=BASE_URL):
    timestamp = str(int(datetime.datetime.now().timestamp() * 1000))
    sign_path = urlparse(base_url + path).path   # incluye /trade-api/v2
    signature = create_signature(private_key, timestamp, "GET", sign_path)
    headers = {
        "KALSHI-ACCESS-KEY": api_key_id,
        "KALSHI-ACCESS-SIGNATURE": signature,
        "KALSHI-ACCESS-TIMESTAMP": timestamp,
    }
    return requests.get(base_url + path, headers=headers)

private_key = load_private_key(PRIVATE_KEY_PATH)
r = get(private_key, API_KEY_ID, "/portfolio/balance")
print(r.json())
```

#### **Errores comunes de autenticación**

| **Problema**                   | **Solución**                                                          |
| ------------------------------ | --------------------------------------------------------------------- |
| 401 Unauthorized               | Revisar el API Key ID y la ruta del archivo de clave privada          |
| Error de frma                  | Asegurar que el tmestamp esté en milisegundos, no en segundos         |
| Path not found                 | Si BASE_URL ya termina en /trade-api/v2, pasar sólo /portolio/balance |
| Error de frma con query params | Firmar el path sin query string: path.split('?')[0]                   |

### **5.3 Superficie de endpoints REST**

#### **Descubrimiento público (sin autenticación)**

Estos endpoints no requieren firma: se pueden llamar directamente. Es el módulo que alimenta la caché de mercados del bot.

| **Método** | **Endpoint**                | **Uso en el proyecto**                                         |
| ---------- | --------------------------- | -------------------------------------------------------------- |
| GET        | /series                     | Listado paginado de series, fltrable por categoría             |
| GET        | /series/{tcker}             | Metadata de una serie                                          |
| GET        | /events                     | Listado de eventos (excluye multvariados)                      |
| GET        | /events/{event_tcker}       | Un evento con sus mercados hijos                               |
| GET        | /markets                    | Listado de mercados; fltros: series_tcker, event_tcker, status |
| GET        | /markets/{tcker}            | Metadata de un mercado puntual                                 |
| GET        | /markets/{tcker}/orderbook  | Libro de órdenes de un mercado                                 |
| GET        | /markets/orderbooks?tckers= | Libros en lote (hasta 100 tckers por llamada)                  |
| GET        | /markets/trades             | Fills públicos recientes                                       |

#### **Portfolio (requiere firma RSA-PSS)**

| **Método** | **Endpoint**                    | **Uso**                                         |
| ---------- | ------------------------------- | ----------------------------------------------- |
| GET        | /portolio/balance               | Saldo de efectvo                                |
| GET        | /portolio/positons              | Posiciones abiertas                             |
| GET        | /portolio/orders                | Historial de órdenes (paginado por cursor)      |
| GET        | /portolio/orders/{order_id}     | Estado de una orden puntual                     |
| POST       | /portolio/orders                | Crear una orden                                 |
| PUT        | /portolio/orders/{order_id}     | Modifcar precio o cantdad                       |
| DELETE     | /portolio/orders/{order_id}     | Cancelar una orden                              |
| GET        | /portolio/flls                  | Ejecuciones individuales                        |
| GET        | /portolio/setlements            | Registros de liquidación                        |
| POST       | /portolio/events/orders         | Superfcie V2 de creación (recomendada a futuro) |
| POST       | /portolio/events/orders/batched | Alta de órdenes en lote                         |
| GET        | /account/limits                 | Presupuesto vivo del token bucket               |
| GET        | /account/endpoint_costs         | Costo en tokens por endpoint                    |

#### **Parámetros de query de GET /markets**

El endpoint tiene un juego completo de filtros. Ninguno acepta texto libre, pero varios son directamente útiles para el bot:

| **Parámetro**                  | **Tipo**     | **Descripción**                                             | **Uso en el proyecto**                       |
| ------------------------------ | ------------ | ----------------------------------------------------------- | -------------------------------------------- |
| limit                          | int (0–1000) | Resultados por página. Default 100,máximo 1000              | Usar 1000 al construir la caché              |
| cursor                         | string       | Cursor de paginación de la respuestaanterior                | Recorrer el catálogo completo                |
| event_tcker                    | string       | Filtrar por evento (sólo uno)                               | Bajar de evento a mercados                   |
| series_tcker                   | string       | Filtrar por serie                                           | El puente desde tags → series →mercados      |
| status                         | enum         | unopened, open, paused, closed, setled.Sólo uno por request | status=open para el universooperable         |
| tckers                         | string       | Lista de tckers separada por comas                          | Refrescar precios de candidatospuntuales     |
| min_updated_ts                 | int64        | Mercados con metadata actualizadadespués de este Unix ts    | Refresco incremental de lacaché              |
| min_created_ts /max_created_ts | int64        | Filtrado por fecha de creación                              | Detectar mercados nuevos                     |
| min_close_ts / max_close_ts    | int64        | Filtrado por fecha de cierre                                | Descartar los que cierran antesdel horizonte |
| min_setled_ts /max_setled_ts   | int64        | Filtrado por fecha de liquidación                           | Backtestng                                   |
| mve_flter                      | enum         | only / exclude — eventos multvariados(combos)               | exclude para simplifcar el MVP               |

Restricciones importantes: sólo se admite un filtro de status por request, y los filtros de timestamp son mutuamente excluyentes entre sí y con ciertos status. min_created_ts/max_created_ts van con unopened, open o vacío; min_close_ts/max_close_ts con closed o vacío; min_settled_ts/max_settled_ts con settled o vacío. min_updated_ts es incompatible con todo salvo mve_filter=exclude. Combinarlos mal devuelve 400.

#### **El grupo /search: tags como vocabulario controlado**

Kalshi expone un grupo de endpoints etiquetado «search», pero no hace lo que el nombre sugiere: no es búsqueda por texto, es descubrimiento de filtros. Para este proyecto resulta más útil que una búsqueda libre.

| **Método** | **Endpoint**               | **Devuelve**                                                |
| ---------- | -------------------------- | ----------------------------------------------------------- |
| GET        | /search/tags_by_categories | Mapa de categorías de series → sus tags asociados           |
| GET        | /search/flters_by_sports   | Filtros disponibles organizados por deporte (no aplica acá) |

Y GET /series acepta esos tags como filtro:

| **Parámetro de GET /series** | **Descripción**                                                             |
| ---------------------------- | --------------------------------------------------------------------------- |
| category                     | Filtrar por categoría de serie                                              |
| tags                         | Filtrar por tags. Separados SÓLO por comas: ?tags=Roten Tomatoes,Television |
| include_volume               | Si es true, incluye el volumen total operado en la serie                    |
| min_updated_ts               | Series con metadata actualizada después de este Unix ts (polling efciente)  |
| include_product_metadata     | Metadata interna de producto                                                |

Trampa documentada: el parámetro tags se separa únicamente por comas, no por espacios. Un tag con espacios como «Rotten Tomatoes» funciona tal cual; si el código lo splitea por espacios (como hacía la propia API antes de octubre de 2025), no matchea nada.

#### **Arquitectura de matching revisada**

Con tags disponibles, el matching deja de ser un problema de embeddings puros y pasa a ser un problema de mapeo, que es mucho más barato, determinístico y auditable:

1. Una sola vez (y refrescado a diario): GET /search/tags_by_categories para obtener el vocabulario real de tags que usa Kalshi.

2. Mapear cada tema de la taxonomía propia (sección 4.2) a uno o varios tags/categorías de Kalshi. Este mapeo es una tabla escrita a mano, revisada por una persona. Es la pieza de mayor apalancamiento del sistema.

3. Por cada tema, GET /series?tags=<tags>&include_volume=true → lista acotada de series, con volumen para descartar las ilíquidas de entrada.

4. Por cada serie relevante, GET /markets?series_ticker=<ticker>&status=open&limit=1000 → mercados operables, en caché.

5. Refresco incremental con min_updated_ts en vez de recorrer todo el catálogo cada vez.

6. El índice semántico (embeddings sobre title, yes_sub_title, rules_primary) queda como desempate dentro del conjunto ya filtrado por tags — no como buscador global.

El resultado: en vez de buscar semánticamente sobre miles de mercados en el camino crítico de la orden, se resuelve tema → tags → series → tickers con una tabla en memoria, y el LLM sólo desempata entre un puñado de candidatos.

#### **Paginación**

Todos los endpoints de listado aceptan cursor y limit y devuelven un campo cursor. Cuando viene vacío o ausente, se llegó al final. No hay conteo total en la respuesta: no se puede mostrar una barra de progreso determinística, sólo «N obtenidos hasta ahora». Los defaults y máximos varían por endpoint.

### **5.4 El orderbook: sólo bids**

Peculiaridad que rompe implementaciones ingenuas: por la dualidad de los mercados binarios (YES + NO = USD 1,00), Kalshi expresa cada lado del libro únicamente como bids. No hay asks en ninguna parte de la respuesta.

```json
{
  "orderbook_fp": {
    "yes_dollars": [
      // bids para comprar YES, ascendente por precio
      ["0.3900", "5.00"], // [price_dollars, count_fp]
      ["0.4000", "13.00"],
      ["0.4200", "13.00"] // <- mejor bid de YES (ÚLTIMO elemento)
    ],
    "no_dollars": [
      ["0.5400", "8.00"],
      ["0.5600", "17.00"] // <- mejor bid de NO
    ]
  }
}
```

Tres consecuencias prácticas:

- Precios y cantidades son strings de punto fijo. Los campos enteros antiguos (yes_bid en centavos, count) fueron removidos durante la migración del Q1 2026. Parsear con Decimal, nunca con float.

- Los arrays vienen ordenados ascendentemente: el mejor bid es el último elemento, no el primero.

- El ask de YES se deriva: YES_ask = 1,00 − mejor_bid_de_NO. En el ejemplo, mejor YES bid = 0,4200 y YES ask = 1,00 − 0,5600 = 0,4400, con spread de 2 centavos.

### **5.5 Creación de órdenes**

ATENCIÓN — cambio de superficie en curso. Desde el 22 de abril de 2026 Kalshi recomienda migrar a los endpoints V2 de órdenes bajo /portfolio/events/orders. El changelog anunció que los endpoints legacy /portfolio/orders\* se marcarían como deprecados «no antes del 21 de mayo de 2026», que su costo en tokens podía subir desde el 14 de mayo, y entradas posteriores del changelog fijaron la deprecación de los endpoints legacy de mutación para la ventana del 18 al 25 de junio de 2026, tras la cual devuelven «Please switch to the V2 endpoints». A la fecha de este documento esa ventana ya pasó: TODO el desarrollo nuevo debe apuntar a los endpoints V2. Verificar el estado exacto en el changelog antes de escribir el cliente.

#### **Endpoints V2 de órdenes (recomendados)**

| **Método** | **Endpoint**                                | **Acción**                                              |
| ---------- | ------------------------------------------- | ------------------------------------------------------- |
| POST       | /portolio/events/orders                     | Crear                                                   |
| DELETE     | /portolio/events/orders/{order_id}          | Cancelar                                                |
| POST       | /portolio/events/orders/{order_id}/amend    | Modifcar precio y/o cantdad máxima                      |
| POST       | /portolio/events/orders/{order_id}/decrease | Reducir cantdad (reduce_by o reduce_to, exactamenteuno) |
| POST       | /portolio/events/orders/batched             | Alta en lote                                            |
| DELETE     | /portolio/events/orders/batched             | Cancelación en lote                                     |

Diferencias de la superficie V2 respecto de la legacy:

- Usa una forma de libro único bid/ask en vez de la matriz action × side.

- Precios en punto fijo en dólares, no enteros en centavos.

- Respuestas livianas: el cancel V2 devuelve {order_id, client_order_id, reduced_by} en vez del objeto completo.

- Incluyen ts_ms: el timestamp del motor de matching en milisegundos Unix, es decir el instante real en que se procesó la orden. Para medir la latencia tuit → ejecución de punta a punta, este campo es el que hay que loguear.

#### **Campos de dirección normalizados**

Desde el 6 de mayo de 2026 las respuestas de Order, Fill y Trade incluyen dos campos que llevan el bit direccional completo, sin necesidad de combinar action con side:

- outcome_side (yes | no): el resultado del que se beneficia el usuario. Comprar-yes y vender-no producen yes; comprar-no y vender-yes producen no.

- book_side (bid | ask): el mismo bit en vocabulario de libro. bid equivale a yes, ask equivale a no.

Los campos action, side, is_yes, purchased_side y taker_side quedaron marcados como deprecados. Para una integración nueva, leer outcome_side y book_side y no escribir la matriz de conversión.

#### **Ejemplo con la superficie legacy (referencia histórica)**

El siguiente es el ejemplo que publica el quick start oficial. Se incluye porque ilustra los campos y el uso de client_order_id, pero el endpoint que usa está en vía de deprecación — leerlo como referencia conceptual, no copiarlo a producción:

```py
import uuid

order_data = {
    "ticker": market["ticker"],
    "action": "buy",                       # buy | sell
    "side": "yes",                         # yes | no
    "count": 1,                            # cantidad de contratos
    "type": "limit",                       # limit
    "yes_price": 42,                       # centavos, rango 1-99
    "client_order_id": str(uuid.uuid4())   # deduplicación
}

response = post(private_key, API_KEY_ID, "/portfolio/orders", order_data)

if response.status_code == 201:
    order = response.json()["order"]
    print(order["order_id"], order["status"])
```

#### **client_order_id: por qué es obligatorio en este diseño**

- Se genera un UUID único por orden antes de enviarla.

- Si hay un problema de red y no se sabe si la orden entró, se reenvía con el mismo client_order_id: la API rechaza el duplicado en vez de abrir una segunda posición.

- Permite trackear la orden localmente antes de recibir el order_id del servidor.

En un bot que reacciona a un tuit, un timeout de red sin idempotencia significa duplicar la posición justo en el peor momento (mercado moviéndose). El client_order_id no es opcional: es la única defensa contra doble ejecución.

#### **Códigos de error en la creación de órdenes**

| **Código** | **Signifcado**                                           | **Manejo**                           |
| ---------- | -------------------------------------------------------- | ------------------------------------ |
| 401        | Unauthorized: claves o frma mal generadas                | Revisar frma; no reintentar a ciegas |
| 400        | Bad Request: parámetros inválidos (precio fuera de 1-99) | Bug del bot: alertar, no reintentar  |
| 409        | Confict: ya existe una orden con ese client_order_id     | Tratar como éxito idempotente        |
| 429        | Too Many Requests: se superó el rate limit               | Backof exponencial con jiter         |

Otros errores documentados en la superficie de órdenes: invalid_order_size (cantidad no permitida), available_balance_too_low (saldo insuficiente), order_id_and_client_order_id_mismatch (desajuste al modificar o cancelar) e «invalid order: post only cross» (una orden post-only que hubiese cruzado el spread).

### **5.6 WebSocket: datos en tiempo real**

Polling del orderbook cada segundo es caro y llega tarde. Para un bot que necesita saber si su orden se llenó y cómo se está moviendo el precio, el WebSocket es obligatorio.

#### **Autenticación del handshake**

Misma firma RSA-PSS que REST, pero enviada como headers HTTP en el request de upgrade — no en la URL ni en el mensaje de subscribe. El path a firmar es /trade-api/ws/v2:

```py
timestamp + "GET" + "/trade-api/ws/v2"
timestamp + "GET" + "/trade-api/ws/v2"
ws_headers = create_headers(private_key, "GET", "/trade-api/ws/v2")

async with websockets.connect(WS_URL, additional_headers=ws_headers) as ws:
    await ws.send(json.dumps({
        "id": 1,
        "cmd": "subscribe",
        "params": {
            "channels": ["orderbook_delta"],
            "market_tickers": ["KXHIGHNY-23DEC25-T75"]
        }
    }))
    async for raw in ws:
        msg = json.loads(raw)
        if msg.get("type") == "orderbook_snapshot":
            ...   # estado completo inicial
        elif msg.get("type") == "orderbook_delta":
            ...   # cambios incrementales
```

#### **Canales**

| **Grupo**                    | **Canales**                                                                 | **Nota**                                                      |
| ---------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Privados (datos del usuario) | orderbook_delta, fll, market_positons, communicatons,order_group_updates    | Requieren sesión autentcada                                   |
| Públicos (market data)       | tcker, trade, market_lifecycle_v2,multvariate_market_lifecycle, multvariate | Usan la sesión autentcada perosin chequeo adicional por canal |

Canales de interés directo para el bot: fill (saber al instante si la orden se ejecutó), orderbook_delta (seguimiento del precio para stop/take-profit) y market_lifecycle_v2 (detectar cierre o suspensión del mercado antes de mandar una orden que va a rebotar).

#### **Ciclo de vida y keep-alive**

1. Conexión inicial con headers de autenticación.

2. Envío de comandos subscribe para los canales deseados.

3. Procesamiento de mensajes por tipo.

4. Manejo de desconexiones con reconexión y backoff exponencial.

El heartbeat es del lado del servidor: Kalshi manda Ping y el cliente debe responder Pong. La librería websockets de Python lo hace automáticamente; otras librerías pueden requerir implementarlo a mano. Si se deja de responder, el servidor cierra la conexión.

#### **Códigos de error del WebSocket (selección)**

| **Código** | **Error**                 | **Descripción**                                                 |
| ---------- | ------------------------- | --------------------------------------------------------------- |
| 1          | Unable to process message | JSON inválido o tpo incompatble con el esquema                  |
| 2          | Params required           | Faltan params o parámetros obligatorios de suscripción          |
| 3          | Channels required         | El comando subscribe no incluyó ningún canal                    |
| 6          | Already subscribed        | Ya hay una suscripción actva a ese canal en la sesión           |
| 8          | Unknown channel name      | El canal no existe en este endpoint                             |
| 9          | Authentcaton required     | El canal requiere autentcación no otorgada                      |
| 11         | Invalid parameter         | Formato inválido, p. ej. market ID malformado                   |
| 16         | Market not found          | El market_tcker no corresponde a ningún mercado                 |
| 17         | Internal error            | Error del servidor; si persiste, contactar a soporte            |
| 25         | Subscripton bufer overfow | Ráfaga de mensajes desbordó el bufer: suscribirse a menos datos |

##### Formato del mensaje de error:

```json
{ "id": 123, "type": "error", "msg": { "code": 2, "msg": "Params required" } }
```

Trampa habitual: el error 9 (Authentication required) tras un subscribe hace pensar que falta autenticar el mensaje. No existe forma de hacerlo — la autenticación va en el handshake. Si aparece el 9, el problema está en los headers del upgrade.

### **5.7 Rate limits: modelo de token bucket**

Cada request autenticado consume tokens. El tier define cuántos tokens por segundo se pueden gastar. La mayoría de los requests cuesta el default de 10 tokens; la página de referencia de cada operación indica el costo cuando difiere (cancelaciones de órdenes, lecturas de orden individual, create/cancel de quotes y lookup de colecciones multivariadas son actualmente más baratos).

La tasa efectiva para un endpoint es presupuesto ÷ costo.

#### **Dos presupuestos independientes**

| **Bucket** | **Qué cubre**                                                          |
| ---------- | ---------------------------------------------------------------------- |
| Read       | Endpoints GET y todo lo que no esté ruteado explícitamente a otro lado |
| Write      | Alta de órdenes, amends, cancels, order groups y el fujo de quotes RFQ |

Los buckets son independientes: saturar lecturas no ralentiza las escrituras. Además, la API de Perps usa los mismos tiers pero se mide en sus propios buckets, lo que da hasta cuatro buckets independientes en total.

#### **Tiers y presupuestos (tokens por segundo)**

| **Tier** | **Read** | **Write** | **Cómo se obtene**                   |
| -------- | -------- | --------- | ------------------------------------ |
| Basic    | 200      | 100       | Completar el alta de la cuenta       |
| Advanced | 300      | 300       | Completar la Advanced API applicaton |
| Premier  | 1.000    | 1.000     | Criterios a publicar por Kalshi      |
| Paragon  | 2.000    | 2.000     | Criterios a publicar por Kalshi      |
| Prime    | 4.000    | 4.000     | Criterios a publicar por Kalshi      |

En Basic, con el costo default de 10 tokens, eso equivale a ~20 lecturas/segundo y ~10 escrituras/segundo. Para este bot es holgado: el cuello de botella es la señal, no la API.

#### **Bursting y 429**

- El bucket de Write acumula dos segundos de presupuesto: el tráfico ocioso construye margen que se puede gastar en una ráfaga. Está pensado justamente para clientes event-driven que reaccionan rápido a movimientos del mercado — el caso de este proyecto.

- Basic es la excepción: su bucket de Write sólo retiene un segundo de presupuesto, sin margen acumulado.

- Al exceder el límite se devuelve 429 con el body {"error": "too many requests"}.

- Las respuestas 429 NO incluyen Retry-After ni headers X-RateLimit-\*. Hay que aplicar backoff exponencial (con jitter) hasta que el bucket se rellene. No hay cooldown forzado: el siguiente request se acepta apenas haya tokens suficientes.

- Los endpoints batch NO ahorran tokens: 25 órdenes en una llamada batched cuestan 25 × 10 = 250 tokens. El batch ahorra round-trips, no presupuesto.

### **5.8 Comisiones: el factor que decide la viabilidad**

Este es el punto que hay que resolver antes de escribir una línea de código, porque determina si la estrategia puede ser rentable en absoluto.

Fórmula del fee taker (redondeado hacia arriba al centavo siguiente):

`− fee = round_up_al_centavo( 0.07 × C × P × (1 P) )`

`C = cantidad de contratos P = precio en dólares (0,45 para 45¢)`

La curva es una parábola que alcanza su máximo en 50¢ y tiende a cero en los extremos:

| **Precio del contrato** | **P × (1 − P)** | **Fee taker por contrato** | **% del valor** |
| ----------------------- | --------------- | -------------------------- | --------------- |
| 50¢                     | 0,25            | 1,75¢                      | 3,50%           |
| 40¢ / 60¢               | 0,24            | 1,68¢                      | ≈ 3,4%          |
| 10¢ / 90¢               | 0,09            | 0,63¢                      | ≈ 1,3%          |
| 5¢ / 95¢                | 0,0475          | 0,33¢                      | ≈ 0,7%          |

Punto crítico para la estrategia de «comprar y vender tras X tiempo»: cada round trip paga el fee DOS veces — una al entrar y otra al salir. En un contrato a 50¢ eso es ~3,5% del valor nocional sólo en comisiones, antes del spread. La señal política tiene que mover el precio más de 3,5 centavos para que la operación tenga sentido. Mantener hasta la liquidación (settlement) es gratis en el lado de salida; salir antes por precio no lo es.

Consideraciones adicionales sobre fees, según la información pública disponible:

- Las órdenes maker (límite que descansa en el libro) pagan sustancialmente menos que las taker; en muchos mercados el lado maker es muy barato o nulo. Pero un bot que reacciona a un tuit necesita ejecución inmediata: es estructuralmente taker.

- El multiplicador 0,07 aplica a la mayoría de las categorías; algunas categorías premium usan multiplicadores mayores. No hace falta adivinarlo: cada serie devuelve fee_type y fee_multiplier en GET /series. El bot debe leer esos campos y calcular el fee exacto antes de decidir, no asumir 0,07.

- fee_type toma tres valores: quadratic (la fórmula parabólica descrita arriba), quadratic_with_maker_fees (igual, más fees de maker) y flat (tabla de fees específicos). El fee schedule oficial está en https://kalshi.com/docs/kalshi-fee-schedule.pdf.

- Existe GET /series/fee_changes, que devuelve los cambios de fees programados de una serie. Con show_historical=true trae todos, pasados y futuros. Vale la pena consultarlo: un cambio de fee programado puede volver inviable una estrategia marginal de un día para el otro.

- Cada serie también expone additional_prohibitions: una lista de prohibiciones de trading adicionales.
  - Conviene leerla antes de automatizar sobre una serie.

- El redondeo hacia arriba al centavo hace que el fee efectivo sea levemente mayor que la fórmula nominal, especialmente en órdenes chicas.

- La liquidación es gratuita. Depósitos y retiros por ACH y wire son gratuitos; con tarjeta de débito hay un cargo de procesamiento.

### **5.9 SDKs y especificaciones**

| **Recurso**                       | **Referencia**                                 |
| --------------------------------- | ---------------------------------------------- |
| OpenAPI REST (predicciones)       | htps://docs.kalshi.com/openapi.yaml            |
| AsyncAPI WebSocket (predicciones) | htps://docs.kalshi.com/asyncapi.yaml           |
| OpenAPI REST (perps)              | htps://docs.kalshi.com/perps_openapi.yaml      |
| AsyncAPI WebSocket (perps)        | htps://docs.kalshi.com/perps_asyncapi.yaml     |
| SDK Python (sync / async)         | kalshi_python_sync, kalshi_python_async (PyPI) |
| SDK TypeScript                    | kalshi-typescript (npm)                        |

Los paquetes antiguos kalshi-python (v1.x) y la documentación en trading-api.readme.io / trading-api.kalshi.com están desactualizados. La documentación vigente está en docs.kalshi.com. Descargar el openapi.yaml y generar el cliente es la vía más segura para no arrastrar campos removidos.

## **6. Motor de decisión y ejecución**

### **6.1 Máquina de estados de una operación**

```
TWEET_RECIBIDO
   ├─ firma del webhook inválida ──────────▶ DESCARTADO (alerta de seguridad)
   ├─ autor no monitoreado ────────────────▶ DESCARTADO
   ▼
CLASIFICADO (tema, dirección, confianza)
   ├─ confianza < umbral ──────────────────▶ REGISTRADO_SIN_OPERAR
   ├─ tema fuera de la taxonomía ──────────▶ REGISTRADO_SIN_OPERAR
   ├─ no aporta novedad ───────────────────▶ REGISTRADO_SIN_OPERAR
   ▼
MERCADOS_CANDIDATOS (matching contra caché)
   ├─ sin mercado abierto ─────────────────▶ REGISTRADO_SIN_OPERAR
   ├─ spread > máximo tolerado ────────────▶ RECHAZADO_POR_LIQUIDEZ
   ├─ precio ya movido > umbral ───────────▶ RECHAZADO_LLEGAMOS_TARDE
   ▼
VALIDACION_DE_RIESGO
   ├─ excede exposición máxima por tema ───▶ RECHAZADO
   ├─ excede pérdida diaria máxima ────────▶ KILL_SWITCH
   ▼
ORDEN_ENVIADA (client_order_id, limit)
   ├─ 409 ─────────────────────────────────▶ tratar como éxito idempotente
   ├─ sin fill en N segundos ──────────────▶ CANCELAR
   ▼
POSICION_ABIERTA (confirmada por canal fill)
   ├─ T + Δ vencido ───────────────────────▶ CERRAR
   ├─ stop loss alcanzado ─────────────────▶ CERRAR
   ├─ take profit alcanzado ───────────────▶ CERRAR
   ├─ mercado cerrado/suspendido ──────────▶ MANTENER_HASTA_SETTLEMENT
   ▼
CERRADA → registro de PnL y atribución de la señal
```

### **6.2 La política de salida temporizada**

El enunciado del proyecto define la salida como «después de X tiempo». Vale la pena problematizarlo, porque es la decisión de diseño con mayor impacto en el PnL:

- Un timer fijo asume que la reacción del mercado tiene una duración constante. No la tiene: un anuncio de aranceles se absorbe en minutos, un rumor de despido de un funcionario puede tardar días en resolverse.

- Alternativa recomendada: salida por convergencia. Cerrar cuando la volatilidad del orderbook vuelve a su nivel pre-tuit, con un timeout duro como red de seguridad.

- Añadir siempre stop loss: si la interpretación del tuit fue errónea, el timer sólo garantiza perder durante más tiempo.

- Considerar mantener hasta el settlement cuando la tesis sigue siendo válida: el lado de salida sale gratis y ahorra ~1,75% en fees.

- Δ debe ser un parámetro por tema, calibrado con backtesting, no una constante global.

### **6.3 Límites de riesgo obligatorios**

| **Control**                         | **Propósito**                                   | **Valor inicial sugerido** |
| ----------------------------------- | ----------------------------------------------- | -------------------------- |
| Exposición máxima por operación     | Que un error de clasifcación no funda la cuenta | 1–2% del capital           |
| Exposición máxima por tema          | Evitar correlación oculta entre mercados        | 5% del capital             |
| Pérdida diaria máxima (kill switch) | Frenar en cascadas de señales erróneas          | 5% del capital             |
| Máximo de órdenes por minuto        | Contener bugs en bucle                          | 3                          |
| Spread máximo tolerado              | No pagar el spread de un mercado ilíquido       | 3–4 centavos               |
| Slippage máximo desde la señal      | Abortar si el precio ya se movió                | Confgurable por tema       |
| Modo dry-run                        | Todo el pipeline sin enviar órdenes             | Actvado por defecto        |

El kill switch debe poder accionarse manualmente desde el dashboard y debe cancelar todas las órdenes abiertas. Un bot event-driven conectado a una cuenta con dinero real, sin freno manual accesible en un segundo, es un riesgo operativo inaceptable.

## **7. Dashboard y observabilidad**

El dashboard cumple dos funciones distintas que conviene no mezclar: control operativo en vivo y análisis posterior de desempeño.

### **7.1 Vista operativa**

- Estado de las conexiones: webhook de X válido/inválido (GET /2/webhooks), WebSocket de Kalshi conectado, última señal recibida hace N segundos.

- Posiciones abiertas con PnL no realizado y tiempo restante hasta el cierre programado.

- Saldo y presupuesto de rate limit consumido (GET /account/limits).

- Botón de kill switch.

### **7.2 Log de decisiones**

Cada tuit procesado debe generar un registro auditable, opere o no. Esto es lo que después permite entender por qué el bot ganó o perdió:

```json
{
  "timestamp_tweet": "2026-07-17T14:32:01.120Z",
  "timestamp_recibido": "2026-07-17T14:32:01.640Z",   // latencia de ingesta
  "timestamp_decision": "2026-07-17T14:32:03.010Z",
  "timestamp_orden": "2026-07-17T14:32:03.290Z",
  "post_id": "1846...",
  "texto": "...",
  "clasificacion": { "tema": "...", "direccion": "...", "confianza": 0.84 },
  "mercados_evaluados": ["KX...-A", "KX...-B"],
  "mercado_elegido": "KX...-A",
  "precio_pre_senal": "0.4200",
  "precio_ejecucion": "0.4500",
  "decision": "COMPRA" | "NO_OPERAR",
  "motivo_no_operar": "confianza_baja" | "sin_mercado" | "spread_alto" | null,
  "resultado": { "salida": "0.4900", "pnl_neto": 3.10, "fees": 1.75 }
}
```

### **7.3 Métricas de desempeño**

| **Métrica**                           | **Por qué importa**                                                                          |
| ------------------------------------- | -------------------------------------------------------------------------------------------- |
| Latencia tuit → orden (p50, p95, p99) | Es la ventaja compettva completa del sistema; si el p95 supera unossegundos, la tesis se cae |
| Hit rate por tema                     | Permite apagar temas que no funcionan sin apagar el bot                                      |
| PnL bruto vs. PnL neto de fees        | La brecha revela si la estrategia está sobre-operando                                        |
| Slippage vs. precio pre-señal         | Mide cuánto de la señal ya estaba precifcado al llegar                                       |
| Tasa de falsos positvos               | Calidad del clasifcador                                                                      |
| Costo de X API por operación rentable | Unit economics reales del sistema                                                            |

## **8. Stack tecnológico propuesto**

| **Capa**            | **Tecnología**                              | **Justfcación**                                             |
| ------------------- | ------------------------------------------- | ----------------------------------------------------------- |
| Receptor de webhook | Python + FastAPI (async)                    | Responder en < 10 s es obligatorio; async evitabloqueos     |
| Cola                | Redis Streams (o Kafa a escala)             | Desacopla ingesta de procesamiento; permitereplay           |
| Persistencia        | PostgreSQL + TimescaleDB                    | Series temporales de precios y auditoría dedecisiones       |
| Caché de mercados   | Redis + índice vectorial (FAISS / pgvector) | Matching tema → mercado en < 200 ms                         |
| Clasifcador         | LLM vía API + reglas + embeddings           | Comprensión de contexto, ironía y negación                  |
| Cliente Kalshi      | Generado desde openapi.yaml + frmapropia    | Evita campos removidos en la migración 2026 Q1              |
| Dashboard           | Next.js / Streamlit                         | Streamlit para MVP; Next.js si se productza                 |
| Secretos            | AWS Secrets Manager / Vault                 | La clave privada de Kalshi no se recupera si sepierde       |
| Observabilidad      | Prometheus + Grafana + Sentry               | Alertas de latencia y de webhook inválido                   |
| Despliegue          | Contenedores en región us-east-1            | Cercanía a la infraestructura de X y Kalshi = menorlatencia |

Detalle no obvio: el reloj del contenedor debe estar sincronizado por NTP. Un contenedor con deriva de reloj falla la firma de Kalshi con un 401 idéntico al de una clave equivocada, y se pueden perder horas depurando el código de firma cuando el problema es el reloj.

## **9. Riesgos y consideraciones**

### **9.1 Riesgos técnicos**

| **Riesgo**                        | **Impacto**                    | **Mitgación**                                                        |
| --------------------------------- | ------------------------------ | -------------------------------------------------------------------- |
| Webhook marcado inválido sinaviso | Ceguera total del sistema      | Monitorear GET /2/webhooks; alertar; usar replay job                 |
| Tuit falso inyectado en elwebhook | Orden real por señal falsa     | Verifcar x-twiter-webhooks-signature siempre                         |
| Doble ejecución por tmeout        | Posición duplicada             | client_order_id idempotente                                          |
| Gaps de secuencia trasreconexión  | Orderbook local desincronizado | Usar la acción get_snapshot y resincronizar                          |
| Deriva de reloj                   | 401 permanente e inexplicable  | NTP obligatorio; chequeo de salud al arranque                        |
| Cambio de precios/acceso en XAPI  | Costos o diseño rotos          | El modelo cambió dos veces en 2026; revisar laconsola periódicamente |
| Migración de campos de Kalshi     | Parseo roto en silencio        | Usar campos \_fp de punto fjo; validar con elopenapi.yaml            |

### **9.2 Riesgos de estrategia**

- Competencia: no somos los primeros. Hay bots comerciales que ya hacen exactamente esto sobre Kalshi y Polymarket, y fondos con infraestructura de latencia mucho mejor. La ventana de arbitraje sobre un tuit de Trump probablemente se mide en cientos de milisegundos, no en segundos.

- Liquidez: muchos mercados políticos de Kalshi son delgados. Una orden que mueva el libro come su propia ganancia; el spread puede ser mayor que la señal.

- Ambigüedad semántica: un tuit puede afectar varios mercados en direcciones opuestas, o ser puro ruido retórico. El clasificador no tiene forma de saber si «lo dijo en serio».

- Reflexividad: si la estrategia funciona y se replica, la ventana se cierra sola.

- Fees: como se detalla en 5.8, el round trip cuesta ~3,5% a precios medios. Muchas señales reales no mueven tanto.

### **9.3 Riesgos legales y regulatorios**

- Kalshi es un exchange designado y regulado por la CFTC. Usar la API implica aceptar el Developer Agreement (kalshi.com/developer-agreement). Leerlo antes de automatizar.

- Existen restricciones de elegibilidad geográfica para operar en Kalshi. Verificar la situación desde el país de residencia antes de invertir tiempo de desarrollo.

- La API de X está sujeta a los Developer Terms; los datos de X tienen restricciones de retención y redistribución. El scraping de Truth Social u otras fuentes sin API pública puede violar sus términos de servicio.

- Operar sobre información pública en un exchange regulado es legal, pero el trading algorítmico automatizado puede tener obligaciones de registro o reporte según jurisdicción y volumen.

Recomendación: consultar con un profesional legal antes de operar con capital real, particularmente sobre elegibilidad jurisdiccional. Este documento no constituye asesoramiento legal ni financiero.

## **10. Roadmap por fases**

| **Fase**             | **Objetvo**                | **Entregable**                                                                                | **Criterio de salida**                                          |
| -------------------- | -------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 0 — Viabilidad       | Validar acceso yeconomía   | Cuenta de X con créditos; cuenta demo deKalshi; confrmación de qué endpoints estánhabilitados | El acceso a XAA post.create estáconfrmado                       |
| 1 — Ingesta          | Recibir tuits en temporeal | Webhook con CRC y verifcación de frma;suscripciones creadas; log de latencia                  | p95 de latencia de ingesta < 2 sdurante 7 días                  |
| 2 — Mercados         | Conocer el universoKalshi  | Caché de mercados abiertos; índicesemántco; matching tema → tckers                            | Precisión de matching validada amano sobre 100 tuits históricos |
| 3 — Clasifcación     | Decidir sin operar         | Clasifcador + taxonomía + log de decisionesen modo dry-run                                    | Hit rate direccional > 55% enbacktest                           |
| 4 — Ejecucióndemo    | Operar sin dinero real     | Órdenes en el entorno demo; máquina deestados completa; kill switch                           | 30 días sin incidentes de dobleejecución                        |
| 5 — Producciónmínima | Capital pequeño y real     | Despliegue con límites de riesgo estrictos                                                    | PnL neto de fees positvo concapital acotado                     |
| 6 — Escala           | Optmizar                   | Más temas, calibración de Δ por tema,upgrade de ter si hace falta                             | Unit economics sostenidos                                       |

La Fase 0 no es burocracia: es el único momento barato para descubrir que el Filtered Stream no está disponible en el plan contratado, o que la cuenta no puede operar desde la jurisdicción. Ambas cosas invalidan partes enteras del diseño.

## **11. Referencias**

### **11.1 Documentación oficial de X**

- Precios y créditos: https://docs.x.com/x-api/getting-started/pricing

- X Activity API — introducción: https://docs.x.com/x-api/activity/introduction

- X Activity API — quickstart: https://docs.x.com/x-api/activity/quickstart

- Webhooks V2: https://docs.x.com/x-api/webhooks/introduction

- Filtered Stream Webhooks (Enterprise): https://docs.x.com/x-api/webhooks/stream/introduction

- Filtered Stream — construcción de reglas: https://docs.x.com/x-api/posts/filtered-stream/integrate/build-arule

- Account Activity API: https://docs.x.com/x-api/account-activity/introduction

- Developer Console: https://console.x.com

### **11.2 Documentación oficial de Kalshi**

- Bienvenida y especificaciones: https://docs.kalshi.com/welcome

- Entornos y endpoints: https://docs.kalshi.com/getting_started/api_environments

- Quick start — market data: https://docs.kalshi.com/getting_started/quick_start_market_data

- Quick start — requests autenticados:
  - https://docs.kalshi.com/getting_started/quick_start_authenticated_requests

- Quick start — primera orden: https://docs.kalshi.com/getting_started/quick_start_create_order

- Quick start — WebSockets: https://docs.kalshi.com/getting_started/quick_start_websockets

- Rate limits y tiers: https://docs.kalshi.com/getting_started/rate_limits

- Referencia de GET /markets: https://docs.kalshi.com/api-reference/market/get-markets

- Referencia de GET /series: https://docs.kalshi.com/api-reference/market/get-series-list

- Tags por categoría: https://docs.kalshi.com/api-reference/search/get-tags-for-series-categories

- Índice completo de la documentación: https://docs.kalshi.com/llms.txt

- Changelog: https://docs.kalshi.com/changelog — RSS en /changelog/rss.xml

- Especificación OpenAPI: https://docs.kalshi.com/openapi.yaml

- Fee schedule (PDF): https://kalshi.com/docs/kalshi-fee-schedule.pdf

- Developer Agreement: https://kalshi.com/developer-agreement

Acción concreta: suscribir el RSS del changelog de Kalshi (https://docs.kalshi.com/changelog/rss.xml) al canal del equipo. Sólo en 2026 hubo migración a punto fijo con remoción de campos, cambio del modelo de rate limits, nueva superficie V2 de órdenes con deprecación de la anterior, partición de datos históricos, nuevos hosts y campos de dirección normalizados. Una integración que no siga el changelog se rompe sola en cuestión de semanas.

### **11.3 Nota sobre las fuentes**

Los datos de endpoints, autenticación, límites, tipos de evento, parámetros de query y precios de este documento fueron verificados contra la documentación oficial de docs.x.com y docs.kalshi.com al 17 de julio de 2026, incluyendo las especificaciones OpenAPI publicadas y el changelog. Los parámetros de GET /markets y GET /series, los endpoints del grupo /search, los campos fee_type y fee_multiplier, la superficie V2 de órdenes y los campos outcome_side/book_side salen directamente del spec oficial.

Quedan dos puntos con incertidumbre declarada. Primero: la disponibilidad del Filtered Stream v2 por plan — las fuentes de terceros se contradicen y la documentación oficial no la fija de forma inequívoca; hay que confirmarla en la Developer Console. Segundo: la fecha exacta de deprecación de los endpoints legacy /portfolio/orders\* — el changelog accesible en esta revisión llegaba hasta el 21 de mayo de 2026, mientras que el índice de búsqueda mostraba entradas posteriores que ubican la deprecación entre el 18 y el 25 de junio de 2026. Consultar el changelog en vivo antes de implementar.

La fórmula de fees (0,07 × C × P × (1−P)) y la relación maker/taker provienen del fee schedule de Kalshi y de análisis de terceros; la existencia de fee_type y fee_multiplier por serie está confirmada en el spec oficial, y el bot

debe leer esos campos en vez de asumir el multiplicador. Ambas APIs cambiaron significativamente durante 2026 y seguirán cambiando.
