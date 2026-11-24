# MarketLab AI

Demo full stack de análisis de mercado, backtesting y un asistente
con herramientas. Construido con TypeScript, React, Express y Gemini.

**Todos los precios son simulados.** El proyecto demuestra ingeniería
de software y ejecución reproducible de estrategias; no proporciona
cotizaciones reales ni recomendaciones de inversión.

## Funcionalidades

- Dashboard de MSFT y AAPL con precios OHLCV simulados.
- Intervalos diario (`1d`) y cinco minutos (`5m`).
- Filtros de fechas inclusivos en UTC.
- Indicadores descubiertos automáticamente desde archivos del backend.
- Backtesting de una estrategia RSI 2 con comisiones y benchmark.
- Chat con herramientas para indicadores, backtests y comparaciones.
- Texto progresivo, eventos de herramientas y cancelación mediante SSE.
- Respuestas con Markdown, tablas, gráficos, SVG y archivos descargables.
- Exportación de operaciones a CSV y comparación de métricas a SVG.

## Arquitectura

```text
frontend/
  src/features/market/
    components/       Dashboard, backtest y chat
    marketApi.ts      Consultas y mutaciones RTK Query
    marketUiSlice.ts  Símbolo, intervalo, rango y preferencias
    chatStream.ts     Actualización y deduplicación de eventos

backend/
  src/
    agent/            Cliente Gemini, herramientas y orquestador
    checks/           Comprobaciones automatizadas
    data/             Datos simulados
    indicators/       Un archivo por indicador
    providers/        Adaptador de datos de mercado
    routes/           Backtests, chat y descargas
    services/         Cálculos, validación y almacenamiento en memoria
    strategies/       Reglas de la estrategia
    types/            Contratos TypeScript
    app.ts            Aplicación Express e inyección del cliente LLM
    server.ts         Arranque HTTP
```

React utiliza Redux Toolkit para el estado de la interfaz y RTK Query
para las peticiones HTTP. Recharts presenta precios y resultados.

Express valida las entradas y ejecuta los servicios. El adaptador de
datos permite separar su origen de los cálculos.

Gemini solicita herramientas; los indicadores, resultados de backtesting,
tablas, gráficos y reportes se obtienen de los servicios del backend.
Los puntos de los gráficos y el SVG no los inventa el modelo.

La interfaz `LlmClient` permite sustituir Gemini por clientes falsos en
las pruebas, sin credenciales ni peticiones a un proveedor externo.

## Requisitos

- Node.js 24 y npm.
- Git, si se clona el repositorio.
- Una API key de Gemini únicamente para utilizar el asistente real.

Docker no es necesario para este entregable.

## Instalación

```bash
git clone https://github.com/andresalba-tech/marketlab.git
cd marketlab
npm --prefix backend ci
npm --prefix frontend ci
```

## Arranque sin API key

En una terminal, desde la raíz:

```bash
npm --prefix backend run dev
```

En otra terminal:

```bash
npm --prefix frontend run dev
```

Abre la URL indicada por Vite, normalmente:

```text
http://localhost:5173
```

El backend escucha en `http://localhost:3000`.
Vite redirige `/api` al backend, incluida la conexión SSE.

No hace falta crear `.env`. El dashboard, los indicadores y el backtest
funcionan con datos simulados. El chat necesita credenciales: al enviar
una pregunta sin ellas, devuelve un error controlado.

Comprobación básica del backend:

```text
http://localhost:3000/health
http://localhost:3000/api/indicators
```

## Arranque con Gemini

Crea `backend/.env`:

```dotenv
GEMINI_API_KEY=tu_clave
GEMINI_MODEL=nombre_del_modelo_disponible_en_tu_cuenta
```

Usa un modelo habilitado para tu cuenta que admita llamadas a herramientas
y streaming. Su disponibilidad depende del proveedor.

Reinicia el backend después de configurar las variables.

La clave se lee exclusivamente en el backend. No uses variables
`VITE_` para secretos ni publiques `.env` en Git.

Puedes comprobar que Git lo ignora desde la raíz:

```bash
git check-ignore backend/.env
```

## Compilación

Desde la raíz:

```bash
npm --prefix backend run build
npm --prefix frontend run build
```

El backend limpia `dist` antes de compilar. Esto evita conservar
indicadores compilados que ya fueron eliminados del código fuente.

Para ejecutar el backend compilado:

```bash
npm --prefix backend start
```

Detén primero el backend de desarrollo si está usando el puerto 3000.

El frontend compilado queda en `frontend/dist`. Para desplegarlo,
el servidor de archivos estáticos deberá redirigir `/api` al backend
y permitir SSE sin buffering. El proxy de Vite es de desarrollo.

## Pruebas

Desde la raíz:

```bash
npm --prefix backend test
npm --prefix frontend test
npm --prefix frontend run lint
```

Las pruebas automatizadas no requieren API key ni acceso a Gemini.
Algunas pruebas del backend abren servidores HTTP locales en puertos
asignados por el sistema.

Se comprueban, entre otros:

- Fórmulas y calentamiento de indicadores.
- Validación, orden y rangos de las velas.
- Registro dinámico de indicadores y contratos.
- Backtesting, comisiones, benchmark y ausencia de anticipación.
- Herramientas del agente, errores, límites y cancelación.
- Descarga HTTP de CSV y SVG.
- Entrega SSE, reconexión y secuencia entre turnos.
- Renderizado seguro de Markdown y sanitización de SVG.
- Deduplicación de eventos y reemplazo de mensajes provisionales.

## Catálogo de indicadores

- **sma200:** media móvil simple de 200 cierres diarios.
  Se superpone al precio y requiere calentamiento.
- **momentum12_1:** momentum diario que aproxima doce meses y excluye
  el último mes usando 252 y 21 sesiones.
- **rsi2:** RSI de dos períodos con suavizado de Wilder.
  Se muestra en un panel separado.
- **vwap:** VWAP por sesión aproximado con precio típico y volumen
  de velas intradía. Se superpone al precio.

El proveedor de esta demo ofrece `1d` y `5m`. La lista de indicadores
se filtra según compatibilidad con el intervalo.

Cada archivo de `backend/src/indicators` debe exportar por defecto una
definición válida. El registro utiliza el nombre del archivo sin extensión.

En producción se debe recompilar y reiniciar tras cambiar indicadores.
Los módulos importados se almacenan en caché; el descubrimiento de
archivos no equivale a recargar automáticamente su implementación.

## Backtesting

La única estrategia de este entregable es RSI 2:

- Entrar long cuando RSI 2 es menor que 10.
- Salir cuando RSI 2 es mayor que 70.
- Señal al cierre de una vela; ejecución en la siguiente apertura.
- Sin operaciones durante valores `null` de calentamiento.
- Sin posiciones cortas ni apalancamiento.
- Uso del capital disponible, admitiendo cantidades fraccionarias.
- Comisión en puntos básicos al entrar y salir.
- Cierre de la posición pendiente al último cierre del período.

Los cálculos conservan el historial previo necesario para el
calentamiento antes de seleccionar la ventana solicitada.

El resultado incluye operaciones, curva de capital, drawdown,
capital final, retorno total, número de operaciones y porcentaje
de operaciones ganadoras.

El benchmark compra al inicio y mantiene hasta el final, usando
el mismo capital, comisiones y ventana temporal.

No se modelan spread, deslizamiento, liquidez, dividendos ni impuestos.
Las reglas RSI son las de esta demo, no una implementación completa
de una estrategia externa.

## API principal

- `GET /health`
- `GET /api/market/:symbol`
- `GET /api/indicators`
- `GET /api/indicators/:name`
- `GET /api/market/:symbol/indicators/:name`
- `POST /api/backtests`
- `GET /api/backtests/:id`
- `POST /api/chat/sessions/:id/messages`
- `GET /api/chat/sessions/:id/events`
- `POST /api/chat/sessions/:id/cancel`
- `GET /api/reports/:id/download`

Las consultas de mercado y cálculo de indicadores aceptan `interval`,
`from` y `to`. Las fechas de rango usan `YYYY-MM-DD`.

## Chat y streaming

El agente dispone de cuatro herramientas:

- `calculateIndicators`
- `runBacktest`
- `compareStrategies`
- `generateReport`

El orquestador valida argumentos, limita llamadas y tiempos de espera,
y adjunta trazas de ejecución sin credenciales.

SSE transmite inicio de mensaje, texto progresivo, actividad de
herramientas, bloques y finalización. Cada sesión conserva los últimos
500 eventos y admite reconexión mediante `Last-Event-ID`.

El frontend deduplica por secuencia e ID de bloque. El mensaje final
reemplaza los textos provisionales y evita duplicar el resultado
recibido por POST.

Cancelar detiene la espera y evita nuevas herramientas. No revierte
resultados ya guardados ni garantiza interrumpir un cálculo síncrono
que ya está ejecutándose.

## Límites del primer entregable

- Datos ficticios de MSFT y AAPL, con historial finito.
- Una estrategia y un proveedor LLM.
- Sesiones, backtests, reportes y eventos almacenados en memoria.
  Reiniciar el backend elimina esos datos.
- Sin cuentas, autenticación ni aislamiento entre usuarios.
  No está preparado para exponerse públicamente sin controles adicionales.
- El chat no recibe automáticamente los filtros del dashboard.
- Si una reconexión necesita eventos que ya salieron del buffer,
  el backend devuelve `409`. La recuperación guiada desde la interfaz
  está pendiente.
- Vite puede advertir que el bundle supera 500 kB.
  La división del código queda pendiente.
- Docker, base de datos y despliegue público quedan fuera de este corte.
- LazyBear, Fibonacci, phi, ADX, NDX y VIX quedan para una fase posterior.

## Recorrido manual de comprobación

1. Cambiar entre MSFT y AAPL.
2. Seleccionar un intervalo e indicador compatible.
3. Ejecutar un backtest y revisar métricas y operaciones.
4. Pedir al chat un backtest con reportes CSV y SVG.
5. Descargar y abrir ambos archivos.
6. Cancelar una respuesta y enviar otra pregunta en la misma sesión.