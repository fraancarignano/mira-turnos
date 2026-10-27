# Mira Turnos — Especificación (v1: demo veterinaria)

> Documento de especificación para desarrollar con Claude Code.
> Proyecto de **Mira Studio**. Autor: Franco Carignano. Fecha: octubre 2026.
> Guardar en el repo como `docs/SPEC.md`.

---

## 0. Cómo usar este documento (para Claude Code)

- Este archivo es la **fuente de verdad** del proyecto. Antes de cada fase, leé la sección correspondiente.
- Trabajá **por fases** (sección 12). No avances a la siguiente sin cumplir los criterios de aceptación de la actual.
- Si algo no está definido acá, elegí la opción más simple, dejala anotada en `docs/DECISIONES.md` y seguí.
- Explicá brevemente el **por qué** de cada decisión técnica no trivial (el desarrollador quiere entender el razonamiento, no solo copiar código).
- Idioma: **código, tablas y columnas en español** (`turnos`, `profesionales`, `inicio`, `fin`). **UI en español rioplatense con voseo** ("Elegí el servicio", "Confirmá tu turno").

---

## 1. Objetivo

Construir un **sistema de turnos online multi-tenant** que sirva para dos cosas:

1. **Demo comercial**: mostrarle a veterinarias (y después a otros rubros) un sistema real funcionando, con datos ficticios, desde el celular.
2. **Base del producto real**: cuando un cliente compra, se crea su empresa, se cargan sus servicios y su branding. **No se reescribe nada.**

El sistema cumple la promesa del mensaje comercial:
> "Una página donde el cliente ve los servicios y saca turno solo, con recordatorio automático, y ustedes ven todo ordenado en una agenda."

### Decisiones ya tomadas
| Tema | Decisión |
|---|---|
| Rubro de la demo | Veterinaria |
| Alcance clínico | Ficha de mascota + registro de vacunas con próxima dosis y aviso al dueño. **Sin** historia clínica |
| Peluquería canina | Sí, como otra agenda (el peluquero es un profesional más) |
| Repo | Nuevo e independiente (`mira-turnos`) |
| Arquitectura | Núcleo genérico de turnos + módulo "mascotas" activable por rubro |
| Multi-tenant | Sí, por `empresa_id` + RLS desde el día uno |

---

## 2. Stack

- **Next.js** (App Router, versión estable actual) + **TypeScript** estricto
- **Tailwind CSS** + **shadcn/ui**
- **Supabase**: Postgres, Auth, RLS, `pg_cron`, `pg_net`
- **Supabase CLI** para desarrollo local; migraciones en `supabase/migrations/`
- **Vercel** para el deploy
- **Resend** + **React Email** para mails
- **Zod** (validación), **react-hook-form** (formularios)
- **date-fns** + **@date-fns/tz** (fechas y zona horaria)
- **libphonenumber-js** (normalización de teléfonos argentinos)
- **Vitest** (unit) + **Playwright** (e2e)

**No usar** librerías de calendario pesadas (FullCalendar, etc.). La vista de agenda por profesional se construye a mano con CSS grid: es más liviana, se controla mejor y las vistas por recurso de esas librerías suelen ser pagas.

---

## 3. Conceptos del dominio

| Concepto | Genérico | Etiqueta en veterinaria |
|---|---|---|
| Empresa | Negocio que usa el sistema (tenant) | Veterinaria |
| Profesional | Una agenda con horarios propios | Veterinario/a, Peluquero/a |
| Servicio | Lo que se reserva, con duración | Consulta, Vacunación, Baño… |
| Cliente | Quien saca el turno | Dueño/a |
| Paciente (módulo opcional) | Sobre quién es el turno | Mascota |
| Turno | Reserva de un servicio con un profesional en un horario | Turno |

Las etiquetas se leen de `empresas.config.etiquetas`, así el mismo código sirve para estética ("Profesional", "Cliente") u odontología ("Odontólogo/a", "Paciente").

**Módulos por rubro** (`empresas.config.modulos`):
- `mascotas: boolean` → activa ficha de mascota en la reserva y en el panel.
- `vacunas: boolean` → activa catálogo de vacunas, registro y avisos de próxima dosis. Requiere `mascotas`.

Con los módulos apagados, el sistema es un turnero genérico.

---

## 4. Modelo de datos

Todas las tablas de negocio tienen `id uuid pk default gen_random_uuid()`, `empresa_id uuid not null references empresas` (salvo `empresas`) y `created_at timestamptz default now()`.

Extensiones: `btree_gist`, `pg_cron`, `pg_net`.

### 4.1 Tablas

**empresas**
- `nombre text`, `slug text unique` (se usa en la URL pública)
- `rubro text check (rubro in ('veterinaria','estetica','odontologia','taller','generico'))`
- `zona_horaria text default 'America/Argentina/Cordoba'`
- `telefono_whatsapp text` (E.164 sin `+`, ej. `5493511234567`), `email text`, `direccion text`, `logo_url text`, `color_primario text`
- `es_demo boolean default false`
- `config jsonb` con esta forma (validar con Zod en el front):
  ```json
  {
    "etiquetas": { "profesional": "Veterinario/a", "cliente": "Dueño/a", "paciente": "Mascota" },
    "modulos": { "mascotas": true, "vacunas": true },
    "reservas": {
      "intervalo_slots_min": 15,
      "anticipacion_min_horas": 2,
      "ventana_dias": 30,
      "cancelar_hasta_horas": 3,
      "max_turnos_futuros_por_telefono": 3
    },
    "recordatorios": { "horas_antes": 24, "dias_aviso_vacuna": 7 }
  }
  ```

**miembros** (vincula usuarios de Supabase Auth con empresas)
- `user_id uuid references auth.users`, `empresa_id`, `rol text check (rol in ('admin','staff'))`, `profesional_id uuid null`
- `unique (user_id, empresa_id)`

**profesionales**
- `nombre text`, `especialidad text`, `color text` (hex, para la agenda), `activo boolean default true`, `orden int`

**servicios**
- `nombre text`, `descripcion text`, `categoria text` (ej. `consulta`, `vacunacion`, `cirugia`, `peluqueria`)
- `duracion_min int check (> 0)`, `buffer_min int default 0` (tiempo de limpieza/preparación después del turno)
- `precio numeric null` (null = "Consultar")
- `requiere_paciente boolean default true` (si el módulo mascotas está activo)
- `reservable_online boolean default true` (las cirugías se cargan solo desde el panel)
- `activo boolean default true`, `orden int`

**profesional_servicios** (n:n)
- `profesional_id`, `servicio_id`, pk compuesta

**horarios** (varios rangos por día: mañana y tarde con corte al mediodía)
- `profesional_id`, `dia_semana smallint check (between 1 and 7)` (ISO: 1 = lunes)
- `hora_inicio time`, `hora_fin time`, `check (hora_fin > hora_inicio)`

**bloqueos** (feriados, vacaciones, trámites)
- `profesional_id uuid null` (null = bloquea a todo el negocio)
- `inicio timestamptz`, `fin timestamptz`, `motivo text`

**clientes**
- `nombre text`, `telefono text` (normalizado E.164 sin `+`), `email text null`, `notas text`
- `unique (empresa_id, telefono)`

**mascotas** (módulo `mascotas`)
- `cliente_id`, `nombre text`, `especie text check (especie in ('perro','gato','otro'))`
- `raza text`, `sexo text check (sexo in ('macho','hembra'))`, `fecha_nacimiento date null` (puede ser aproximada), `peso_kg numeric null`, `castrado boolean null`, `notas text`, `activo boolean default true`

**turnos**
- `profesional_id`, `servicio_id`, `cliente_id`, `mascota_id uuid null`
- `inicio timestamptz`, `fin timestamptz` (inicio + duración)
- `bloquea_hasta timestamptz` (fin + buffer; se calcula al insertar o actualizar)
- `rango tstzrange generated always as (tstzrange(inicio, bloquea_hasta, '[)')) stored`
- `estado text check (estado in ('confirmado','asistio','ausente','cancelado')) default 'confirmado'`
- `origen text check (origen in ('web','manual'))`
- `motivo text` (lo que escribe el cliente), `notas_internas text`
- `token_gestion uuid unique default gen_random_uuid()`
- `recordatorio_enviado_at timestamptz null`, `cancelado_at timestamptz null`

**vacunas** (catálogo por empresa, módulo `vacunas`)
- `nombre text`, `especie text` (`perro`, `gato`, `ambas`), `intervalo_dias int` (para calcular la próxima dosis), `activo boolean`

**vacunas_aplicadas**
- `mascota_id`, `vacuna_id`, `profesional_id null`, `turno_id null`
- `fecha_aplicacion date`, `proxima_dosis date null` (por defecto = aplicación + intervalo, editable)
- `lote text null`, `aviso_enviado_at timestamptz null`

**notificaciones** (log de todo lo que se envía o se "enviaría")
- `tipo text check (tipo in ('confirmacion','recordatorio_turno','aviso_vacuna','cancelacion','reprogramacion'))`
- `canal text check (canal in ('email','whatsapp_manual'))`
- `destinatario text`, `turno_id null`, `vacuna_aplicada_id null`
- `asunto text`, `cuerpo text` (texto listo para WhatsApp)
- `estado text check (estado in ('enviado','error','pendiente'))`, `error text`, `enviado_at timestamptz`

### 4.2 La regla más importante: dos turnos no se pueden pisar

Validar disponibilidad en el código y después insertar tiene una condición de carrera: dos personas que hacen clic en el mismo horario al mismo tiempo quedarían agendadas las dos. Lo resolvemos en la base, que es la única que ve todas las escrituras:

```sql
alter table turnos add constraint turnos_sin_superposicion
  exclude using gist (
    profesional_id with =,
    rango with &&
  ) where (estado <> 'cancelado');
```

- Si el segundo insert choca, Postgres lanza `23P01` (`exclusion_violation`). Las RPC lo atrapan y devuelven el error `HORARIO_OCUPADO`.
- Cancelar un turno libera el horario automáticamente (queda fuera del `where`).
- Reprogramar = `update` de `inicio`, `fin` y `bloquea_hasta`; el constraint se vuelve a aplicar.

### 4.3 Índices
- `turnos (empresa_id, inicio)`, `turnos (cliente_id)`, `turnos (estado, inicio)` para el cron de recordatorios
- `vacunas_aplicadas (proxima_dosis) where aviso_enviado_at is null`
- `clientes (empresa_id, telefono)` (ya cubierto por el unique)

---

## 5. Seguridad (RLS)

**Todas las tablas con RLS activado.** Dos tipos de acceso:

### 5.1 Panel (usuarios autenticados)
Función auxiliar:
```sql
create function es_miembro(p_empresa_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from miembros
    where user_id = auth.uid() and empresa_id = p_empresa_id
  );
$$;
```
Política en cada tabla de negocio: `select/insert/update/delete` permitidos si `es_miembro(empresa_id)`. En `empresas`: `select` si es miembro, `update` solo rol `admin`.

### 5.2 Público (anónimo)
**El rol `anon` no tiene acceso directo a ninguna tabla.** Si se abriera `select` sobre `turnos`, cualquiera podría leer nombres y teléfonos de otros clientes. Todo el acceso público pasa por funciones RPC `security definer` que devuelven solo lo necesario (sección 6). `grant execute` de esas funciones a `anon`.

### 5.3 Privacidad en la reserva pública
- Nunca devolver datos de un cliente existente a partir de su teléfono (no autocompletar mascotas por teléfono: sería una filtración).
- La mascota se asocia en el backend: mismo cliente + mismo nombre (sin distinguir mayúsculas y acentos) = misma mascota; si no existe, se crea.

---

## 6. Funciones RPC

Todas en `supabase/migrations/`, con `set search_path = public`. Las públicas reciben `p_slug` y resuelven la empresa adentro.

### 6.1 Públicas (`anon`)

**`negocio_publico(p_slug)`** → empresa (solo campos públicos + `config.etiquetas` y `config.modulos`), servicios `activo and reservable_online` ordenados por categoría, y profesionales activos con los servicios que hacen.

**`dias_disponibles(p_slug, p_servicio_id, p_profesional_id null, p_desde date, p_hasta date)`** → lista de fechas con al menos un horario libre. Se usa para deshabilitar días en el calendario.

**`horarios_disponibles(p_slug, p_servicio_id, p_profesional_id null, p_fecha date)`** → `(profesional_id, inicio, fin)`.

Algoritmo:
1. Leer `zona_horaria` y `config.reservas` de la empresa.
2. Profesionales candidatos: el elegido, o todos los activos que hacen ese servicio.
3. Para cada profesional, los `horarios` con `dia_semana = isodow(p_fecha)`.
4. Generar inicios cada `intervalo_slots_min` desde `hora_inicio`, mientras `inicio + duracion <= hora_fin`. Convertir a `timestamptz` con `(p_fecha + hora) at time zone v_tz`.
5. Descartar el slot si `tstzrange(inicio, inicio + duracion + buffer)` se superpone con:
   - el `rango` de un turno no cancelado de ese profesional;
   - un `bloqueo` del profesional o de toda la empresa.
6. Descartar slots antes de `now() + anticipacion_min_horas` o después de `ventana_dias`.
7. Si `p_profesional_id` es null, devolver todos (el front agrupa por hora y muestra cada horario una sola vez).

**`reservar_turno(p_slug, p_servicio_id, p_profesional_id null, p_inicio timestamptz, p_cliente jsonb, p_mascota jsonb null, p_motivo text)`** → `{ token_gestion, resumen }`
1. Validar servicio activo y reservable online; validar datos (nombre, teléfono, especie si corresponde).
2. Si no se eligió profesional: entre los que tienen ese horario libre, asignar al que tiene **menos turnos ese día** (empate → `orden`).
3. Upsert de cliente por `(empresa_id, telefono)`. Actualizar nombre y email si vienen.
4. Verificar `max_turnos_futuros_por_telefono` (freno básico de abuso).
5. Buscar o crear la mascota (sección 5.3).
6. Insertar turno con `origen = 'web'`. Atrapar `23P01` → `raise exception 'HORARIO_OCUPADO'`.
7. Devolver token y resumen (servicio, profesional, fecha y hora local, mascota).

**`turno_por_token(p_token)`** → datos del turno para la pantalla de gestión (sin datos de otros turnos).

**`cancelar_turno_por_token(p_token)`** → respeta `cancelar_hasta_horas`; si no llega, `FUERA_DE_PLAZO`.

**`reprogramar_turno_por_token(p_token, p_nuevo_inicio)`** → mismo profesional y servicio; misma regla de plazo; error `HORARIO_OCUPADO` si choca.

### 6.2 Panel (`authenticated`)
El panel usa consultas normales con RLS. RPC solo donde hay lógica:
- **`crear_turno_manual(...)`**: igual que `reservar_turno` pero sin `reservable_online`, sin anticipación mínima ni límite por teléfono, con `origen = 'manual'`, y permitiendo elegir cliente/mascota existentes.
- **`registrar_vacuna(p_mascota_id, p_vacuna_id, p_fecha, p_proxima_dosis null, p_lote, p_turno_id null)`**: si no viene `proxima_dosis`, usa `fecha + intervalo_dias`.

### 6.3 Errores
Las RPC lanzan códigos legibles (`HORARIO_OCUPADO`, `FUERA_DE_PLAZO`, `LIMITE_TURNOS`, `DATOS_INVALIDOS`, `NO_ENCONTRADO`). El front los mapea a mensajes amables en `lib/errores.ts`.

---

## 7. Lado público (cliente final)

**Mobile-first.** La demo se va a mostrar desde el celular, en persona.

### 7.1 Rutas
- `/[slug]` → página del negocio: logo, nombre, dirección, botón de WhatsApp, servicios agrupados por categoría con duración y precio, CTA "Sacar turno".
- `/[slug]/reservar` → asistente por pasos. **El estado vive en los search params** (`?servicio=…&profesional=…&fecha=…&hora=…`), así el botón "atrás" del celular funciona y se puede compartir un link prearmado.
- `/[slug]/turno/[token]` → ver, cancelar o reprogramar.
- `/demo/veterinaria` → redirige al slug de la veterinaria demo (y a futuro `/demo/estetica`, etc.).

### 7.2 Pasos del asistente
1. **Servicio** — tarjetas por categoría (Consultas, Vacunación, Peluquería). Los servicios no reservables online (cirugías) aparecen con "Coordinar por WhatsApp" y abren `wa.me` con texto prearmado.
2. **Profesional** — "Cualquiera disponible" o uno en particular. Si solo uno hace el servicio, se saltea el paso.
3. **Día** — calendario de los próximos `ventana_dias`; días sin lugar deshabilitados (`dias_disponibles`).
4. **Horario** — botones agrupados en "Mañana" y "Tarde".
5. **Datos** —
   - Dueño/a: nombre, teléfono (obligatorio), email (opcional: "Si lo dejás, te mandamos el recordatorio").
   - Mascota (si el módulo está activo): nombre, especie (perro/gato/otro), raza (opcional).
   - Motivo de la consulta (opcional).
   - Campo honeypot oculto contra bots.
6. **Confirmación** — resumen, botón "Agregar al calendario" (archivo `.ics` generado en el cliente + link de Google Calendar), botón "Escribirle a la veterinaria" (`wa.me`), y el link de gestión del turno.

Si al confirmar vuelve `HORARIO_OCUPADO`: "Justo alguien reservó ese horario. Elegí otro 👇" y volver al paso 4 con la disponibilidad recargada.

### 7.3 Teléfonos
Normalizar con `libphonenumber-js` (país por defecto AR) a formato `549XXXXXXXXXX`. Tests obligatorios con estas entradas, todas → `5493511234567`:
`351 1234567`, `0351 15 1234567`, `351 15 1234567`, `+54 9 351 1234567`, `+543511234567`.

---

## 8. Panel del negocio

### 8.1 Acceso
- `/panel/login` con email y contraseña (Supabase Auth, `@supabase/ssr`).
- Botón **"Entrar como demo"**: server action que inicia sesión con un usuario demo (credenciales en variables de entorno, nunca en el cliente). Ese usuario es `admin` solo de la empresa demo.
- Si la empresa es `es_demo`: banner fijo arriba ("Estás viendo una demo de Mira Studio · Los datos se reinician cada noche · [Quiero esto para mi negocio]" → WhatsApp de Mira Studio). La sección "Negocio" (nombre, slug, branding) queda en solo lectura.

### 8.2 Secciones
- **Inicio** (`/panel`): turnos de hoy (lista), turnos de la semana, ausencias del mes, vacunas que vencen en los próximos 7 días.
- **Agenda** (`/panel/agenda`):
  - Vista día: columnas por profesional (con su color), filas cada 15 min, turnos como bloques con mascota + servicio + dueño.
  - Vista semana: un profesional por vez (selector).
  - Navegación ← hoy →. Bloqueos en gris rayado.
  - Clic en hueco libre → crear turno manual con ese profesional y horario precargados.
  - Clic en turno → panel lateral: datos, cambiar estado (Asistió / No vino / Cancelar), reprogramar, notas internas, botón **"Recordatorio por WhatsApp"** (abre `wa.me/<telefono>?text=…` con el mensaje armado) y, si hay email, **"Enviar recordatorio ahora"** (útil para mostrar en la demo sin esperar 24 h).
- **Clientes** (`/panel/clientes`): búsqueda por nombre, teléfono o nombre de mascota. Ficha: datos, mascotas, historial de turnos, cantidad de ausencias.
- **Mascotas** (`/panel/mascotas/[id]`): datos de la mascota, edad calculada, turnos, **vacunas aplicadas** con próxima dosis, botón "Registrar vacuna".
- **Vacunas** (`/panel/vacunas`): próximas dosis (vencidas, esta semana, este mes), con botón de aviso por WhatsApp y estado del aviso por email.
- **Mensajes** (`/panel/mensajes`): log de `notificaciones` mostrando cada mensaje como burbuja estilo WhatsApp. Sirve para que el prospecto vea qué recibiría su cliente.
- **Configuración**:
  - Servicios (CRUD, duración, buffer, precio, reservable online, profesionales asignados)
  - Profesionales (CRUD, color, orden)
  - Horarios (por profesional, varios rangos por día, con vista semanal)
  - Bloqueos (rango de fechas, profesional o todo el negocio)
  - Catálogo de vacunas
  - Negocio (datos, logo, color, reglas de reserva)

---

## 9. Notificaciones

### 9.1 Canales
- **Email** (Resend + React Email): real. Requiere dominio verificado en Resend (el de Mira Studio); sin dominio verificado, Resend solo deja mandar a la cuenta propia.
- **WhatsApp manual**: links `wa.me` con texto prearmado que el personal envía con un clic. Funciona hoy, gratis y sin aprobación de Meta.
- **WhatsApp automático (Cloud API de Meta)**: **fuera de alcance.** Requiere negocio verificado, plantillas aprobadas y tiene costo por conversación. Se ofrece como adicional en la venta.

Todas las plantillas de texto viven en un solo lugar: `lib/notificaciones/plantillas.ts` (texto para WhatsApp) y `emails/` (React Email). Todo envío se registra en `notificaciones`.

### 9.2 Cuándo se envía
| Tipo | Disparador | Canal |
|---|---|---|
| Confirmación | Al reservar (web o manual con email) | Email |
| Recordatorio de turno | Cron cada 15 min: turnos `confirmado`, `inicio <= now() + horas_antes`, `inicio > now()`, sin `recordatorio_enviado_at` | Email + log con texto WhatsApp |
| Aviso de vacuna | Cron diario 10:00 hora local: `proxima_dosis` dentro de `dias_aviso_vacuna`, sin `aviso_enviado_at` | Email + log con texto WhatsApp |
| Cancelación / reprogramación | Al cancelar o reprogramar por token | Email |

Los emails de la empresa demo llevan un pie: "Este mensaje es parte de una demo de Mira Studio" con link al WhatsApp del estudio.

### 9.3 Implementación del cron
Todo el envío vive en **Next.js** (un solo runtime y un solo lugar para las plantillas):
- `POST /api/cron/recordatorios` y `POST /api/cron/vacunas`, protegidos con header `Authorization: Bearer ${CRON_SECRET}`.
- Los dispara **`pg_cron` + `pg_net`** desde Supabase. No usar Vercel Cron: en el plan gratuito solo corre una vez por día.
- Cada endpoint marca `recordatorio_enviado_at` / `aviso_enviado_at` **antes** de devolver, para que una doble ejecución no mande dos mails (usar `update … where … is null returning`).

---

## 10. Modo demo

### 10.1 Datos de la veterinaria demo
**Empresa**: "Veterinaria Del Parque" (ficticia), Córdoba, `slug = veterinaria-del-parque`, `es_demo = true`, color primario verde azulado, teléfono y dirección ficticios.

**Profesionales**
| Nombre | Especialidad | Servicios | Horario |
|---|---|---|---|
| Dra. Laura Gómez | Clínica general | Consultas, controles, vacunación, desparasitación, cachorros | Lun–Vie 9–13 y 16–20 · Sáb 9–13 |
| Dr. Martín Ríos | Clínica y cirugía | Consultas, controles, vacunación, castraciones | Lun–Vie 9–13 y 16–20 |
| Sofía Paz | Baño y peluquería | Peluquería | Mar–Vie 9–13 y 15–19 · Sáb 9–13 |

**Servicios** (precios ficticios, editables)
| Servicio | Categoría | Duración | Buffer | Precio | Online |
|---|---|---|---|---|---|
| Consulta clínica | consulta | 30 | 0 | $25.000 | Sí |
| Control / seguimiento | consulta | 20 | 0 | $15.000 | Sí |
| Primera consulta cachorro | consulta | 40 | 0 | $28.000 | Sí |
| Vacunación | vacunacion | 15 | 0 | Consultar | Sí |
| Desparasitación | vacunacion | 15 | 0 | $8.000 | Sí |
| Castración | cirugia | 120 | 30 | Consultar | No |
| Baño (perro chico/mediano) | peluqueria | 60 | 15 | $18.000 | Sí |
| Baño y corte | peluqueria | 90 | 15 | $28.000 | Sí |
| Corte de uñas | peluqueria | 15 | 0 | $5.000 | Sí |

**Catálogo de vacunas**
| Vacuna | Especie | Intervalo |
|---|---|---|
| Antirrábica | ambas | 365 días |
| Séxtuple canina | perro | 365 días |
| Triple felina | gato | 365 días |
| Tos de las perreras | perro | 365 días |

**Clientes y mascotas**: ~25 dueños con nombres argentinos comunes ficticios y ~35 mascotas (mezcla de perros y gatos, razas frecuentes y mestizos) con nombres típicos (Luna, Toto, Milo, Nala, Rocco, Simba…). Teléfonos ficticios con formato válido.

### 10.2 Reset nocturno
Función SQL `reset_demo()` que, para cada empresa `es_demo`:
1. Borra turnos, notificaciones, vacunas aplicadas, mascotas, clientes y bloqueos.
2. Restaura servicios, profesionales, horarios y catálogo de vacunas al estado del seed (upsert por nombre).
3. Regenera:
   - turnos de las **2 semanas pasadas** (estado `asistio`, ~10 % `ausente`);
   - turnos desde **hoy hasta +14 días** con ~60–70 % de ocupación en horarios de consulta y ~50 % en peluquería, siempre dejando huecos libres para poder reservar en vivo;
   - vacunas aplicadas, con **4 a 6 próximas dosis en los próximos 7 días** (para que la sección Vacunas tenga contenido) y algunas vencidas;
   - un bloqueo de ejemplo (ej. "Congreso" un sábado de la próxima semana para el Dr. Ríos).
4. Todo con fechas relativas a `now()` en la zona horaria de la empresa.

`pg_cron` la ejecuta todos los días a las 03:00 hora Argentina (`0 6 * * *` UTC). `supabase/seed.sql` crea la empresa demo y el usuario demo y llama a `reset_demo()`.

### 10.3 Variantes por rubro (fase posterior)
`/demo/estetica`, `/demo/odontologia`: misma app, otra empresa demo con otros servicios, etiquetas, colores y módulos apagados. No requiere código nuevo, solo seed.

---

## 11. Diseño y UX

- Limpio, cálido y confiable. Fondo claro, mucho aire, tipografía legible, bordes redondeados.
- Color de la empresa como variable CSS (`--color-marca`) aplicada a botones y acentos; el resto neutro.
- Lado público: botones grandes (mínimo 44 px de alto), un paso por pantalla, barra de progreso.
- Panel: usable en celular (agenda con scroll horizontal por profesional) y cómodo en escritorio.
- Pie del lado público: "Hecho por Mira Studio" (link discreto a la web o Instagram @mirastudiodev).
- Estados vacíos y de carga cuidados (skeletons, mensajes amables).
- Accesibilidad básica: labels en todos los campos, foco visible, contraste AA.

---

## 12. Fases de desarrollo

Cada fase termina con commit, tests en verde y una nota breve en `docs/PROGRESO.md`.

### Fase 1 — Setup
- Next.js + TS + Tailwind + shadcn/ui, Supabase CLI local, ESLint + Prettier, Vitest, Playwright.
- Estructura de carpetas (sección 13), `.env.example`.
- **Acepta si**: `npm run dev` levanta, `supabase start` anda, un test de ejemplo pasa.

### Fase 2 — Base de datos
- Migraciones: extensiones, tablas, constraint de superposición, índices, RLS, `es_miembro`.
- Tipos generados (`supabase gen types`).
- **Acepta si**: test que inserta dos turnos superpuestos para el mismo profesional falla con `23P01`; dos turnos superpuestos para profesionales distintos pasan; un turno cancelado no bloquea; un usuario de otra empresa no ve datos ajenos; `anon` no puede leer ninguna tabla.

### Fase 3 — Seed y reset demo
- `reset_demo()`, `seed.sql`, usuario demo, job de `pg_cron`.
- **Acepta si**: ejecutar `reset_demo()` dos veces seguidas deja un estado coherente, sin superposiciones y con huecos libres hoy y mañana.

### Fase 4 — Disponibilidad y reserva (RPC)
- `negocio_publico`, `dias_disponibles`, `horarios_disponibles`, `reservar_turno`, `turno_por_token`, `cancelar_turno_por_token`, `reprogramar_turno_por_token`.
- **Acepta si** (tests): respeta horarios partidos, buffer, bloqueos, anticipación mínima y ventana; "cualquiera" asigna al menos cargado; **dos `reservar_turno` concurrentes al mismo slot → uno OK y otro `HORARIO_OCUPADO`**; las fechas se calculan bien en `America/Argentina/Cordoba`.

### Fase 5 — Lado público
- Página del negocio, asistente de 6 pasos, confirmación con `.ics` y WhatsApp, gestión por token.
- **Acepta si**: e2e en viewport de celular reserva un turno de punta a punta y luego lo cancela; con email, se registra la confirmación en `notificaciones`.

### Fase 6 — Panel: acceso y agenda
- Login, "Entrar como demo", banner demo, layout del panel, agenda día/semana, panel lateral del turno, turno manual, cambio de estados, reprogramar.
- **Acepta si**: e2e crea un turno manual desde un hueco libre y lo marca como "Asistió".

### Fase 7 — Clientes, mascotas y vacunas
- Listado y ficha de clientes, ficha de mascota, registrar vacuna, sección Vacunas.

### Fase 8 — Configuración
- Servicios, profesionales, horarios, bloqueos, catálogo de vacunas, datos del negocio (solo lectura en demo).

### Fase 9 — Notificaciones
- Plantillas, Resend, endpoints de cron, jobs `pg_cron` + `pg_net`, botón "Enviar recordatorio ahora", links `wa.me`, sección Mensajes.
- **Acepta si**: correr el endpoint dos veces seguidas no duplica envíos.

### Fase 10 — Pulido y deploy
- Inicio con métricas, estados vacíos, revisión mobile, metadatos/OG para compartir el link, deploy a Vercel + Supabase cloud, `pg_cron` configurado en producción.

---

## 13. Estructura de carpetas sugerida

```
mira-turnos/
├─ app/
│  ├─ [slug]/                 # página pública del negocio
│  │  ├─ reservar/
│  │  └─ turno/[token]/
│  ├─ demo/[rubro]/           # redirects a empresas demo
│  ├─ panel/
│  │  ├─ login/
│  │  ├─ agenda/
│  │  ├─ clientes/
│  │  ├─ mascotas/[id]/
│  │  ├─ vacunas/
│  │  ├─ mensajes/
│  │  └─ config/
│  └─ api/cron/
│     ├─ recordatorios/
│     └─ vacunas/
├─ components/
│  ├─ ui/                     # shadcn
│  ├─ reserva/
│  └─ panel/
├─ emails/                    # React Email
├─ lib/
│  ├─ supabase/               # clientes server/browser
│  ├─ fechas.ts               # todo lo de zona horaria
│  ├─ telefono.ts
│  ├─ errores.ts
│  ├─ config-empresa.ts       # schema Zod de empresas.config
│  └─ notificaciones/
├─ supabase/
│  ├─ migrations/
│  └─ seed.sql
├─ tests/
│  ├─ unit/
│  ├─ db/                     # tests contra Supabase local
│  └─ e2e/
└─ docs/
   ├─ SPEC.md                 # este archivo
   ├─ DECISIONES.md
   └─ PROGRESO.md
```

---

## 14. Variables de entorno

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # solo server (cron)
NEXT_PUBLIC_APP_URL=
DEMO_USER_EMAIL=
DEMO_USER_PASSWORD=
RESEND_API_KEY=
EMAIL_FROM=                       # ej. turnos@<dominio-mira-studio>
CRON_SECRET=
MIRA_STUDIO_WHATSAPP=             # para el CTA del banner demo
```

---

## 15. Reglas transversales

- **Fechas**: guardar siempre `timestamptz`. Toda conversión a hora local pasa por `lib/fechas.ts` usando `empresas.zona_horaria`. Nunca usar la zona horaria del navegador ni del servidor para lógica de negocio.
- **Multi-tenant**: toda consulta del panel filtra por la empresa del usuario, y RLS lo garantiza aunque el código se olvide.
- **Server Components** por defecto; Client Components solo donde hay interacción.
- **Mutaciones** del panel con Server Actions + Zod; revalidar la ruta después.
- **Sin datos reales de personas** en el seed.
- **Nada de secretos** en el cliente.

---

## 16. Fuera de alcance (v1)

- Historia clínica (notas de consulta, diagnósticos, tratamientos)
- Señas o pagos online (Mercado Pago) — candidato a v2: "seña para reducir ausencias"
- WhatsApp automático vía Cloud API de Meta
- Multi-sucursal
- Lista de espera
- Turnos a domicilio
- App nativa
- Facturación
