# Casa Limpia 🧽

App para repartir la limpieza de la casa de forma **automática, justa y visible para todos**.
Funciona como una "autoridad neutral": nadie decide a quién le toca, lo decide la rotación,
y todo queda registrado.

**Abrir la app:** <https://shunlin69.github.io/aplicacion-limpieza-hogar/>

- Reparte 3 turnos por semana (lunes, miércoles y viernes) entre quienes hacen turnos.
- Avisa al celular el domingo, el día del turno y si quedó pendiente.
- Marcar cada parte con un toque, puntos, ranking, premios e intercambios aprobados.

---

## Índice

1. [Para la familia](#1-para-la-familia)
2. [Cómo funciona el reparto y los puntos](#2-cómo-funciona-el-reparto-y-los-puntos)
3. [Para el administrador](#3-para-el-administrador)
4. [Para desarrollar](#4-para-desarrollar)
5. [Montar todo desde cero (otro proyecto Supabase)](#5-montar-todo-desde-cero-otro-proyecto-supabase)
6. [Arquitectura y seguridad](#6-arquitectura-y-seguridad)
7. [Preguntas frecuentes y problemas](#7-preguntas-frecuentes-y-problemas)
8. [Próximos pasos](#8-próximos-pasos)

---

## 1. Para la familia

### Instalar en el iPhone (obligatorio para recibir avisos)

1. Abre **Safari** (no Chrome) y entra a <https://shunlin69.github.io/aplicacion-limpieza-hogar/>.
2. Toca el botón **Compartir** (cuadrado con flecha hacia arriba).
3. Elige **"Agregar a pantalla de inicio"** y luego **Agregar**.
4. Desde ahora abre la app **desde el ícono nuevo** de la pantalla de inicio.

> En iPhone las notificaciones solo funcionan si la app se abre desde ese ícono.
> En Android, Chrome ofrece "Instalar app" en el menú ⋮.

### Crear tu cuenta y unirte al hogar

1. En la app, toca **Crear cuenta**: tu nombre, correo y una contraseña.
2. Elige **Unirme** y escribe el **código de invitación** de 6 letras que te mandó un admin
   (o abre directamente el enlace que te compartió por WhatsApp).
3. La app muestra a qué hogar te vas a unir. Confirma y listo.

### Activar los avisos

**Ajustes → Notificaciones → Activar notificaciones**, acepta el permiso y toca
**"Enviarme una notificación de prueba"**. Debe llegar en segundos.

En la misma tarjeta eliges **a qué hora te avisamos el día de tu turno**: 10:00, 11:00, 12:00 o 16:00.

### Día a día

| Pestaña | Para qué |
| --- | --- |
| **Hoy** | Si te toca, aparece tu lista de "limpio". Marca cada cosa con un toque y al final toca **¡Listo!** (suena y cae confeti 🎉). También ves tu próximo turno, las solicitudes de cambio y las quejas. |
| **Semana** | Quién limpia cada día, quién descansa, el avance en vivo de quien está limpiando, ausencias y turnos que se deben. |
| **Ranking** | Puntos de la semana y del mes, % de cumplimiento, rachas 🔥, quejas 📣, premios del mes e historial de todo lo que pasó. |
| **Tareas** | Los espacios (Cocina, Baño, Living, Comedor), qué significa "limpio" en cada uno y qué días se limpia qué. |
| **Ajustes** | Tu perfil (nombre, emoji, color), avisos, integrantes, invitaciones y rotación. |

¿Te equivocaste al marcar como hecho? Tienes **10 minutos** para tocar **"Me equivoqué, deshacer"**.

**Fotos de respaldo 📷**: en tu turno aparece **Agregar** para sacar una foto (o elegirla de la
galería) de cómo quedó. Puedes subir hasta **4 por turno**, mientras lo haces y hasta **24 horas**
después de terminarlo. Las ven todos los del hogar tocando **📷** en Semana, en Hoy o en el
Historial. Si el admin la dejó **obligatoria**, el botón ¡Listo! espera a que haya al menos una.

### Poner una queja por la limpieza anterior 📣

Si al empezar tu turno encuentras que el turno anterior quedó mal hecho:

1. En tu turno (Hoy) aparece **"Turno anterior: miércoles, Ana"** con el botón **📣 Poner una queja**.
   Ahí mismo puedes ver con **📷** las fotos de respaldo que dejó esa persona.
2. Saca o elige de **1 a 6 fotos** de cómo lo encontraste y escribe en pocas palabras qué quedó mal.
3. Toca **Enviar queja**: a quien hizo ese turno se le resta al instante **la mitad de los puntos
   del turno** y le llega un aviso.

Se puede reclamar mientras haces tu turno y hasta **24 horas después de terminarlo**, solo por el
turno inmediatamente anterior de la casa, y solo si ese turno se terminó (uno "no hecho" ya restó
sus puntos). En esas 24 horas puedes **agregar más fotos** o **retirar la queja** si fue un error
(se devuelven los puntos).

Quien recibe la queja la ve en **Hoy**, con las fotos de la queja y sus propias fotos de respaldo,
y tiene **3 días** para responder:

- **Tiene razón**: la queja queda confirmada.
- **Pedir revisión**: escribe su versión y **un admin decide**: **Mantener** o **Anular y devolver
  los puntos**. Si el admin es parte de la queja, la decide el otro admin.

### Pedir un cambio de turno

1. En tu turno (Hoy o Semana) toca **🔄 Pedir cambio**.
2. Elige con quién y qué ofreces:
   - **Cambiar por un turno suyo**: se intercambian los días.
   - **Que me cubra**: hace tu turno y le quedas debiendo uno (la rotación te lo cobra sola).
3. La otra persona **acepta** desde Hoy y después **un admin aprueba**.
   Si el admin es parte del cambio, lo aprueba el otro admin.

Solo se pueden cambiar turnos pendientes de la semana actual y de la siguiente
(la siguiente se reparte el domingo a las 18:00).

---

## 2. Cómo funciona el reparto y los puntos

### Rotación justa

- Los turnos de la semana se ordenan por fecha (lunes, miércoles, viernes) y se asignan con
  la fórmula: en la semana *k*, la persona en la posición *i* del orden recibe el turno
  *(i + k) mod P*, donde *P* = máx(personas, turnos).
- Con 4 personas y 3 turnos: **cada uno hace cada turno una vez y descansa una semana cada 4**.
- El orden inicial se **sortea al azar en el servidor** (azar criptográfico) y queda en el historial.
- El servidor reparte **automáticamente**: la semana actual siempre, y la siguiente desde el
  **domingo a las 18:00**. Antes de eso la app muestra una *proyección* con el mismo cálculo.

### Semana no disponible (exámenes, viaje)

Un admin marca a la persona en **Ajustes → Rotación → Semana no disponible**. Su turno lo cubre
quien descansa esa semana y queda una **deuda**: quien faltó devuelve el turno en su próxima
semana de descanso, automáticamente. Lo mismo pasa con los cambios "Que me cubra".

### Puntos

| Turno | Espacios | Puntos |
| --- | --- | --- |
| Lunes | Baño + Living | 14 |
| Miércoles | Living + Comedor + Cocina | 19 |
| Viernes | Baño + Living | 14 |

Puntos de un espacio = dificultad (1 a 3) × minutos ÷ 10. Los admins pueden cambiar
dificultad y minutos en **Tareas**; los turnos ya repartidos guardan su valor original.

| Qué pasó | Puntos |
| --- | --- |
| Hecho el mismo día | Completos |
| Hecho después, antes del siguiente turno de la casa | La mitad (redondeada hacia arriba) |
| Llega el siguiente turno de la casa y sigue pendiente | **Se resta** la mitad |
| Quien hizo el turno siguiente pone una **queja** con fotos | **Se resta** la mitad (se devuelve si un admin la anula o se retira) |

Ejemplo: el turno del lunes se puede terminar tarde hasta el martes. El miércoles queda "No hecho".
Un viernes atrasado se puede terminar hasta el domingo.

- **Cumplimiento %**: a tiempo = 100 %, tarde = 50 %, no hecho = 0 %.
- **Racha 🔥**: turnos seguidos hechos a tiempo.
- **Quejas 📣**: cuántas quejas recibió cada uno en el período (las que siguen en pie). Sus puntos
  ya están restados en el total y cuentan en la semana del turno reclamado.
  Ejemplo: una queja por el turno del miércoles (19 pts) le resta 10: quien lo hizo queda con 9.
- Los puntos cuentan en la semana **del turno**, no en la semana en que se registraron.
- **Premios**: metas mensuales que define un admin (ej: "Elegir la película" por 30 pts).
  Se ganan al juntar esos puntos dentro del mes; el día 1 se parte de cero.
  Quien cumple todo a tiempo junta unos 45 a 50 puntos al mes.

### Avisos al celular

| Cuándo | Qué |
| --- | --- |
| Domingo 20:00 | Tu semana ("te toca lunes (Baño y Living)" o "descansas"). Los admins reciben el reparto completo. |
| Día del turno, a tu hora | "Hoy te toca limpiar" |
| Día del turno, 21:00 | Si sigue pendiente |
| Días de atraso, a tu hora | Mientras aún puedas ganar la mitad |
| Al instante | Solicitudes de cambio, aceptaciones y aprobaciones |

---

## 3. Para el administrador

Los admins (en esta casa, los padres) **no hacen turnos** salvo que se marquen como "Hace turnos".

### Invitar a la familia

1. **Ajustes → Invitar a la familia**.
2. Elige el tipo: **Hace turnos** (hijos) o **Admin sin turnos** (el otro padre/madre).
3. Toca **Crear código**. Compártelo por WhatsApp con el botón de compartir.
   Cada código dura **7 días** y sirve hasta para 10 personas.

### Primer arranque (una sola vez)

1. Espera a que **todos los que hacen turnos se hayan unido**: quien llegue después del sorteo
   entra al final de la rotación.
2. Revisa en **Ajustes → Integrantes** que cada uno tenga bien marcado "Hace turnos" y que todos
   tengan **🔔 Avisos** (si alguien tiene 🔕, pídele que active las notificaciones).
3. **Ajustes → Rotación**: elige el lunes de inicio y toca **Sortear orden 🎲**.
   Se puede volver a sortear mientras la rotación no haya empezado.

### Tareas habituales

- **Aprobar cambios de turno**: aparecen arriba en **Hoy**.
- **Revisar quejas**: cuando alguien pide revisión aparece en **Hoy** con las fotos de la queja,
  las fotos de respaldo y las dos versiones. **Mantener** deja la resta; **Anular** devuelve los puntos.
  Las quejas recién puestas también se ven ahí por 3 días, por si hay que anular alguna.
- **Semana no disponible**: Ajustes → Rotación. Si la semana ya estaba repartida, se recalcula
  sola sin tocar turnos ya hechos, pasados o intercambiados.
- **Premios**: Ranking → Mes → Agregar premio.
- **Espacios y lista de "limpio"**: pestaña Tareas.
- **Foto obligatoria u opcional**: Ajustes → tarjeta del hogar → Foto de respaldo. Un admin
  también puede quitar cualquier foto desde el visor.
- **Rol y participación de cada uno**: Ajustes → Integrantes → Editar. El hogar nunca puede
  quedar sin admin.

---

## 4. Para desarrollar

### Requisitos

- Node.js 22 y npm
- (Opcional) [Supabase CLI](https://supabase.com/docs/guides/local-development) para desplegar desde la terminal

### Correr en tu computador

```bash
npm install
npm run dev        # http://localhost:5173 (usa el proyecto Supabase real)
npm test           # 99 pruebas automáticas (Vitest)
npm run build      # revisa tipos y compila a dist/
npx oxlint src     # revisión de estilo
```

Para apuntar a otro proyecto Supabase, crea `.env.local`:

```bash
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_KEY=sb_publishable_...
```

> La *publishable key* es pública por diseño (va dentro de la app). La seguridad la ponen
> las políticas RLS de la base de datos. **Nunca** pongas la *service role key* en la app.

### Estructura

| Carpeta | Contenido |
| --- | --- |
| `src/core` | Lógica pura y probada: rotación, fechas con zona horaria de Chile, frecuencias, puntos, plazos, ranking, códigos de invitación |
| `src/features` | Una carpeta por pantalla: `hoy`, `semana`, `ranking`, `tareas`, `ajustes`, `cambios`, `auth`, `onboarding` |
| `src/hooks` | Datos en vivo: `useWeek`, `useCatalog`, `useScores`, `useSwaps` |
| `src/lib` | Cliente Supabase, notificaciones push, sonidos y confeti, errores |
| `src/state` | Sesión, hogar e integrantes |
| `src/ui` | Estilos (pastel + modo oscuro), barra de pestañas y tarjetas |
| `src/sw.ts` | Service worker: modo sin conexión y recepción de avisos |
| `supabase/migrations` | Tablas, RLS, funciones y tareas programadas, en orden |
| `supabase/functions` | Edge Functions `signup`, `push`, `schedule` y `fotos` |
| `scripts` | `sync-core.sh` (copia el algoritmo al servidor) y `generar-iconos.mjs` |

### Pruebas

`src/core/*.test.ts` cubre: rotación (incluye semanas no disponibles, deudas, más turnos que
personas), fechas con cambio de horario de Chile, frecuencias, peso y puntos de los turnos,
plazos de atraso y puntos por estado, ranking, empates, premios y las reglas de las quejas.

Las reglas del servidor (completar turnos, intercambios, quejas, permisos) se probaron con SQL
cambiando de usuario dentro de la base de datos.

### Publicar

Cada `git push` a `main` corre las pruebas y, si pasan, publica en GitHub Pages
(`.github/workflows/deploy.yml`). En el repositorio debe estar activado
**Settings → Pages → Source: GitHub Actions**.

### Cambiar el algoritmo de reparto

El servidor usa una copia de `src/core`. Después de editar `rotation.ts`, `dates.ts`,
`recurrence.ts` o `effort.ts`:

```bash
npm test
bash scripts/sync-core.sh
supabase functions deploy schedule --no-verify-jwt
```

---

## 5. Montar todo desde cero (otro proyecto Supabase)

1. Crea un proyecto en [supabase.com](https://supabase.com) (región São Paulo, `sa-east-1`, por cercanía).
2. En **Database → Extensions** activa `pg_net` y `pg_cron` (las migraciones también lo intentan).
3. **Antes de aplicar**, reemplaza `nyvzbctefxlomrzteagz` por el id de tu proyecto en
   `supabase/migrations/20261109000007_cron_reparto.sql` y `20261110000011_recordatorios.sql`
   (URLs de las Edge Functions que llaman las tareas programadas).
4. Aplica las migraciones en orden:
   ```bash
   supabase link --project-ref TU-PROYECTO
   supabase db push
   ```
   Esto crea las tablas, las políticas RLS, los secretos en Vault (`cron_secret`) y las tareas
   programadas: `reparto-semanal` (cada hora), `turnos-no-hechos` (cada hora),
   `cambios-vencidos` (cada hora) y `recordatorios` (cada 15 minutos).
5. Despliega las funciones (todas validan la sesión por dentro):
   ```bash
   bash scripts/sync-core.sh
   supabase functions deploy signup --no-verify-jwt
   supabase functions deploy push --no-verify-jwt
   supabase functions deploy schedule --no-verify-jwt
   supabase functions deploy fotos --no-verify-jwt
   ```
6. Las **claves VAPID** de las notificaciones se generan solas la primera vez que alguien
   activa los avisos. La privada queda cifrada en Vault y nunca sale del servidor.
7. Cambia `SUPABASE_URL` y `SUPABASE_KEY` en `src/lib/config.ts` (o usa `.env.local`) y
   `VAPID_SUBJECT` en `supabase/functions/push/index.ts` por la URL de tu app.
8. Si publicas en otra ruta, ajusta `base` en `vite.config.ts`.

---

## 6. Arquitectura y seguridad

```
iPhone (PWA)  ──▶  Supabase
                    ├─ Auth (cuentas con correo)
                    ├─ Postgres + RLS  ◀── el celular solo lee; las acciones son funciones validadas
                    ├─ Realtime        ──▶ la app se actualiza en vivo
                    ├─ pg_cron         ──▶ reparto, no hechos, avisos (hora de Chile del hogar)
                    └─ Edge Functions  ──▶ schedule (reparto/sorteo), push (Web Push), signup, fotos
```

- **Todo cuelga de un hogar** (`household_id`) y cada tabla tiene RLS: nadie ve ni toca datos
  de otro hogar. Está listo para que muchas familias usen la misma base.
- **El celular no puede hacer trampa**: turnos, puntos y deudas solo los escribe el servidor.
  Marcar, completar, intercambiar y aprobar son funciones que validan quién eres, si el turno
  es tuyo, si está en plazo y si eres admin.
- **Puntos** en un libro que solo crece (`points_ledger`); deshacer agrega la resta, no borra.
- **Historial** (`activity_log`) de todo: sorteos, repartos, turnos, cambios, quejas.
- **Fotos** en el bucket privado `fotos-turnos` (ruta `hogar/turno/foto.jpg`): solo se ven con
  enlaces firmados de 1 hora y solo las ve el hogar. Se achican en el celular a 1600 px (~100–300 KB)
  antes de subir. Subir o quitar solo se permite en tu propio turno abierto o hasta 24 h después; quitar lo hace
  la Edge Function `fotos` (la base decide el permiso con la sesión de quien pide).
- **Quejas** (`complaints` y `complaint_photos`): se crean con `file_complaint`, que revisa que sea el
  turno anterior al tuyo, que estés en plazo y que las fotos ya estén subidas (en
  `hogar/quejas/queja/foto.jpg`), y resta los puntos en el mismo paso. Responder, decidir y retirar
  también son funciones validadas; devolver puntos agrega la suma al libro, no borra.
- **Fechas** como días locales `YYYY-MM-DD` con la zona `America/Santiago`; los cambios de
  horario de Chile no corren los días.
- **Avisos** en `notification_log` con llave única (nunca se repiten) y reserva previa para
  evitar envíos dobles. Las suscripciones vencidas se borran solas.
- Las tareas programadas se autentican ante las Edge Functions con un secreto guardado en Vault.

---

## 7. Preguntas frecuentes y problemas

**No me llegan los avisos.** En iPhone: la app debe estar instalada en la pantalla de inicio y
abierta desde ese ícono. Revisa Ajustes del iPhone → Notificaciones → Casa Limpia. Luego en la
app: Ajustes → Notificaciones → Activar y envía una prueba. Si en Integrantes sale 🔕, actívalas
de nuevo (Apple a veces vence la suscripción).

**La app no muestra lo último.** Ciérrala por completo y vuelve a abrirla: se actualiza sola.

**Alguien se unió después del sorteo.** Queda al final de la rotación automáticamente.

**Quiero que un padre también haga turnos.** Ajustes → Integrantes → Editar → Hace turnos.
Entra al final de la rotación.

**Olvidé mi contraseña.** Por ahora la cambia quien administra el proyecto en el panel de
Supabase: **Authentication → Users → (la persona) → Reset password / Update user**.
La recuperación por correo desde la app llega junto con la verificación de correo (ver próximos pasos).

---

## 8. Próximos pasos

La base ya está preparada para:

- **Verificación** del turno por un admin mirando las fotos (campo `verification_status` reservado).
- **Lista de compras** de artículos de limpieza.
- **Lanzamiento público** para más familias. Antes de eso: activar la **verificación de correo**
  con un SMTP propio (hoy las cuentas se crean confirmadas con la función `signup` para no
  depender del límite de correos del plan gratuito) y recuperación de contraseña.
