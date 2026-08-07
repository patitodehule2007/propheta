**ACTIVIDAD 1 --- DEFINICIÓN DEL PROYECTO**

**Propheta**

*Bot de trading algorítmico sobre señales políticas (X → NLP → Kalshi)*

**1. Descripción general**

**¿Cuál es el nombre del proyecto?**

Propheta.

**¿En qué consiste?**

Propheta es un sistema de trading algorítmico que monitorea en tiempo
real las declaraciones de figuras políticas de alto impacto (Donald
Trump, JD Vance, la Casa Blanca y otras cuentas oficiales) publicadas en
X. El sistema determina si cada declaración se relaciona con alguno de
los temas predefinidos sobre los que tiene mandato para operar, busca en
Kalshi los mercados de predicción vinculados a ese tema, ejecuta una
orden de compra y liquida la posición transcurrido un tiempo determinado
(o cuando se cumple una condición de salida, como convergencia de
volatilidad, stop loss o take profit).

La tesis operativa es que los mercados de eventos de Kalshi cambian de
precio tras declaraciones políticas relevantes, y que existe una ventana
de latencia entre la publicación del post y el ajuste completo del
precio. Propheta busca capturar esa ventana.

**¿Cuál es su objetivo principal?**

Capturar, de forma automatizada y auditable, la ventana de tiempo entre
una declaración política relevante y el ajuste completo del precio en
los mercados de predicción de Kalshi (u otros mercados), generando un
retorno neto de comisiones positivo, dentro de límites de riesgo
estrictos y verificables.

**¿Qué tipo de proyecto es?**

Es un sistema backend de trading algorítmico (event-driven), compuesto
por un pipeline de ingesta, clasificación, matching y ejecución, más un
dashboard web de monitoreo y control (Streamlit para el MVP, con
posibilidad de migrar a Next.js).

**¿A qué público está dirigido?**

En esta primera etapa, operará en el entorno demo de Kalshi (sin dinero
real), pensado para que el propio equipo aprenda sobre trading
algorítmico, APIs de mercados de predicción e ingesta de datos en tiempo
real. La arquitectura, sin embargo, se diseña desde el inicio para poder
evolucionar hacia un producto o servicio real, potencialmente
multi-usuario, en fases posteriores.

**2. Alcance**

**Funcionalidades dentro del alcance**

-   Ingesta en tiempo real de posts de cuentas políticas monitoreadas
    vía X Activity API, por webhook o stream persistente.
-   Verificación de seguridad del webhook antes de procesar cualquier
    evento.
-   Clasificación automática de cada post contra una taxonomía cerrada
    de temas (tema, dirección, relevancia, confianza, novedad).
-   Matching automático entre el tema clasificado y los mercados de
    Kalshi relacionados, usando tags y series.
-   Validación de riesgo previa a cada orden (exposición máxima, spread,
    slippage).
-   Ejecución automatizada de órdenes en el entorno demo de Kalshi
-   Cierre de posiciones por tiempo, por convergencia de volatilidad,
    por stop loss/take profit, o mantenimiento hasta settlement.
-   Dashboard operativo con estado de conexiones, posiciones abiertas,
    PnL y kill switch manual.
-   Registro auditable de cada decisión tomada (opere o no) y métricas
    de desempeño (latencia, hit rate, PnL neto de fees).
-   Modo dry-run configurable, que ejecuta todo el pipeline sin enviar
    órdenes reales.

**Funcionalidades fuera del alcance**

-   Operar con capital real
-   Operar con otros mercados aparte de Kalshi
-   Soporte multi-usuario / multi-tenant: se deja como evolución futura
    hacia un producto o servicio
-   Filtered Stream Webhooks de X: variante disponible solo en plan
    Enterprise, descartada por costo.
-   Scraping de fuentes sin API oficial (por ejemplo Truth Social):
    quedan como fuente complementaria a evaluar a futuro

**3. Funcionalidades**

Listado de funcionalidades principales de Propheta (sin detallar
implementación):

1.  Monitoreo en tiempo real de cuentas políticas mediante X Activity
    API.
2.  Recepción de eventos vía webhook HTTPS con verificación CRC.
3.  Verificación de firma del webhook para prevenir la inyección de
    posts falsos.
4.  Deduplicación y normalización de texto y entidades de cada post
    recibido.
5.  Clasificación automática de tema, dirección y confianza mediante
    LLM + reglas.
6.  Taxonomía cerrada y configurable de temas sobre los que el bot puede
    operar.
7.  Detección de novedad, para no operar sobre declaraciones ya
    conocidas.
8.  Caché local de mercados abiertos de Kalshi, con refresco
    incremental.
9.  Matching automático tema → tags/series → mercados candidatos de
    Kalshi.
10. Validación de riesgo previa a cada orden (exposición, spread,
    slippage).
11. Ejecución de órdenes en Kalshi (entorno demo).
12. Cierre de posición por tiempo, por convergencia de volatilidad o por
    stop/take profit.
13. Kill switch manual y automático por pérdida diaria máxima.
14. Dashboard operativo en tiempo real.
15. Registro auditable de cada decisión tomada o descartada.
16. Métricas de desempeño (latencia tuit→orden, hit rate por tema, PnL
    neto).
17. Modo dry-run configurable para probar todo el pipeline sin enviar
    órdenes reales.

**4. Historias de usuario**

1.  Como **operador del bot**, quiero ver el estado de la conexión al
    webhook de X en el dashboard para saber si el sistema está
    recibiendo señales en tiempo real.
2.  Como **operador del bot**, quiero ver el estado de la conexión
    WebSocket con Kalshi para confirmar que puedo recibir fills y
    actualizaciones de precio.
3.  Como **operador del bot**, quiero contar con un botón de kill switch
    en el dashboard para detener todas las operaciones y cancelar
    órdenes abiertas de forma inmediata.
4.  Como **administrador del sistema**, quiero que cada webhook entrante
    verifique la firma x-twitter-webhooks-signature para evitar que se
    ejecuten órdenes basadas en posts falsos.
5.  Como **desarrollador**, quiero definir y editar la taxonomía de
    temas operables para controlar sobre qué tipo de declaraciones puede
    actuar el bot.
6.  Como **desarrollador**, quiero mapear manualmente cada tema de la
    taxonomía a tags/series de Kalshi para asegurar un matching preciso
    y auditable entre post y mercado.
7.  Como **operador del bot**, quiero que el sistema descarte
    automáticamente posts con baja confianza de clasificación para
    evitar operar sobre señales ambiguas.
8.  Como **operador del bot**, quiero que el sistema detecte si un post
    no aporta novedad respecto a declaraciones previas del mismo autor
    para no operar sobre información que el mercado ya tiene
    precificada.
9.  Como **analista de riesgo**, quiero definir límites de exposición
    máxima por operación y por tema para evitar que un error de
    clasificación comprometa una parte significativa del capital.
10. Como **analista de riesgo**, quiero que el sistema aplique un stop
    loss automático a cada posición abierta para limitar pérdidas si la
    interpretación del post fue errónea.
11. Como **analista de riesgo**, quiero que el sistema active un kill
    switch automático al superar la pérdida diaria máxima para frenar
    cascadas de señales erróneas.
12. Como **operador del bot**, quiero ver en el dashboard las posiciones
    abiertas con su PnL no realizado para monitorear el desempeño en
    tiempo real.
13. Como **operador del bot**, quiero consultar un log auditable de cada
    post procesado, opere o no para entender por qué el bot decidió
    operar o no operar.
14. Como **analista de riesgo**, quiero ver métricas de latencia entre
    el post y la orden (p50, p95, p99) para verificar que el sistema
    sigue capturando la ventana de oportunidad.
15. Como **analista de riesgo**, quiero ver el hit rate direccional por
    tema para poder desactivar temas que no están funcionando sin apagar
    todo el bot.
16. Como **desarrollador**, quiero correr el sistema completo en modo
    dry-run para validar el pipeline de punta a punta sin arriesgar
    capital.
17. Como **operador del bot**, quiero que el sistema cierre
    automáticamente una posición al vencer el tiempo definido o al
    detectar convergencia de volatilidad para no depender de
    intervención manual constante.
18. Como **desarrollador**, quiero que cada orden enviada use un
    client_order_id único para evitar duplicar posiciones ante fallas de
    red.
19. Como **analista de riesgo**, quiero ver el presupuesto de rate limit
    consumido en Kalshi para anticipar bloqueos por exceso de
    solicitudes antes de que ocurran.
20. Como **futuro usuario del producto (trader)**, quiero poder acceder
    a un dashboard con mis propias posiciones y configuración para
    eventualmente usar Propheta como servicio multi-usuario.

**5. Escenario de demostración**

La demo corre contra el entorno demo de Kalshi, en modo dry-run/demo
controlado, sin capital real. Un post de una cuenta monitoreada (real o
simulado) dispara el pipeline completo: se clasifica, se hace matching
con un mercado de Kalshi, se envía una orden y todo se refleja en el
dashboard con su PnL. El usuario también podrá accionar el kill switch,
ver cómo se cancelan las órdenes abiertas y revisar el log de decisiones
para entender por qué el bot operó o no.
