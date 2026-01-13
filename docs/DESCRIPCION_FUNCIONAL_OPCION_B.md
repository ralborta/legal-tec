# 📋 Descripción Funcional Detallada - Opción B: Sistema de Control y Estabilidad para Piloto

## 🎯 Objetivo General

La **Opción B** es una solución de control y estabilidad diseñada para garantizar el funcionamiento estable de la plataforma durante períodos de prueba intensiva (pilotos) con múltiples usuarios simultáneos. La solución es **agnóstica a países** y puede aplicarse a una jurisdicción específica o a múltiples jurisdicciones simultáneamente, sin requerir modificaciones en el código base.

---

## 🏗️ Arquitectura General

La solución está compuesta por **4 componentes principales** que trabajan de forma independiente pero coordinada:

1. **Rate Limiting (Límite de Solicitudes)**
2. **Concurrency Control (Control de Concurrencia)**
3. **Automatic Cleanup (Limpieza Automática)**
4. **Monitoring & Metrics (Monitoreo y Métricas)**

Cada componente es **configurable mediante variables de entorno**, lo que permite adaptar el comportamiento sin modificar código, facilitando su aplicación a diferentes contextos geográficos o de uso.

---

## 1️⃣ Rate Limiting (Límite de Solicitudes por Usuario)

### 📌 Propósito

Evitar que usuarios individuales o grupos de usuarios sobrecarguen el sistema realizando demasiadas solicitudes en un período corto de tiempo. Protege contra:
- Uso abusivo accidental o intencional
- Saturación de recursos del servidor
- Consumo excesivo de APIs externas (OpenAI)

### 🔧 Funcionamiento Técnico

**Implementación:** Sistema en memoria (sin dependencias externas como Redis)

**Mecanismo:**
- Cada solicitud se identifica por la **dirección IP** del cliente (o `X-Forwarded-For` si está disponible)
- Se mantiene un registro en memoria de cuántas solicitudes ha realizado cada IP en una ventana de tiempo
- Si un usuario excede el límite, la solicitud es rechazada con código HTTP `429 (Too Many Requests)`

**Configuración Actual:**
- **Endpoint `/api/generate-suggested-doc`**: 10 solicitudes por hora por IP
- **Endpoint `/legal/upload`**: 5 solicitudes por hora por IP

**Ventana de Tiempo:**
- Cada ventana es independiente por IP
- Al expirar una ventana, el contador se reinicia automáticamente
- Limpieza automática de registros expirados cada 5 minutos

### 🌍 Aplicación Multi-País

**Sin modificaciones de código:**
- El rate limiting funciona automáticamente por IP, independientemente del origen geográfico
- Si se requiere límites diferentes por país, se puede implementar lógica adicional basada en headers o geolocalización IP (futuro)

**Configuración por país (futuro):**
```env
# Ejemplo: límites más estrictos para ciertos países
RATE_LIMIT_ARGENTINA_MAX_REQUESTS=10
RATE_LIMIT_ARGENTINA_WINDOW_MS=3600000
RATE_LIMIT_MEXICO_MAX_REQUESTS=15
RATE_LIMIT_MEXICO_WINDOW_MS=3600000
```

### 📊 Respuesta al Usuario

Cuando se excede el límite:
```json
{
  "error": "Rate limit exceeded",
  "message": "Has excedido el límite de solicitudes. Intenta nuevamente más tarde.",
  "retryAfter": 3600
}
```

---

## 2️⃣ Concurrency Control (Control de Análisis Concurrentes)

### 📌 Propósito

Limitar la cantidad de análisis de documentos que se procesan **simultáneamente** en el servidor. Esto previene:
- Saturación de la API de OpenAI (que tiene sus propios límites)
- Consumo excesivo de recursos del servidor (CPU, memoria)
- Timeouts y errores por sobrecarga

### 🔧 Funcionamiento Técnico

**Implementación:** Semáforo en memoria con cola de espera

**Mecanismo:**
- El sistema mantiene un contador de análisis activos
- **Límite máximo:** 3 análisis simultáneos (configurable)
- Cuando se alcanza el límite, las solicitudes adicionales se ponen en **cola de espera**
- Al finalizar un análisis, se procesa automáticamente el siguiente en la cola

**Flujo de Proceso:**
1. Usuario solicita análisis de documento
2. Sistema verifica si hay slots disponibles
3. Si hay slot disponible → inicia análisis inmediatamente
4. Si no hay slot → agrega a cola de espera
5. Cuando un análisis termina → libera slot y procesa siguiente en cola

**Ventajas:**
- Los usuarios no reciben errores, solo esperan su turno
- El sistema mantiene un rendimiento predecible
- No requiere Redis ni bases de datos externas

### 🌍 Aplicación Multi-País

**Comportamiento actual:**
- El límite es **global** para todos los usuarios, independientemente del país
- Si 3 usuarios de Argentina están analizando documentos, un usuario de México debe esperar

**Configuración por país (futuro):**
```env
# Ejemplo: límites de concurrencia por país
CONCURRENCY_LIMIT_ARGENTINA=3
CONCURRENCY_LIMIT_MEXICO=3
CONCURRENCY_LIMIT_COLOMBIA=2
# Total global: suma de todos los límites por país
```

**Alternativa (actual):**
- Límite global compartido es suficiente para pilotos pequeños (4-5 usuarios)
- Para escalar a múltiples países, se puede implementar límites por país o por región

### 📊 Estado de la Cola

El usuario puede consultar el estado mediante el endpoint `/metrics`:
```json
{
  "concurrency": {
    "active": 2,      // 2 análisis en curso
    "max": 3,         // máximo permitido
    "waiting": 1      // 1 análisis esperando
  }
}
```

---

## 3️⃣ Automatic Cleanup (Limpieza Automática de Datos)

### 📌 Propósito

Mantener la base de datos y el almacenamiento de archivos bajo control, evitando que se llenen durante períodos de uso intensivo. Especialmente crítico durante pilotos donde múltiples usuarios suben muchos documentos.

### 🔧 Funcionamiento Técnico

**Implementación:** Scheduler automático que se ejecuta periódicamente

**Estrategias de Limpieza (funcionan en conjunto):**

#### Estrategia 1: Límite por Cantidad (Principal)
- **Objetivo:** Mantener solo los últimos N documentos
- **Configuración:** `CLEANUP_MAX_DOCUMENTS` (ej: 50)
- **Funcionamiento:**
  - El sistema cuenta todos los documentos ordenados por fecha (más recientes primero)
  - Si hay más de N documentos, borra automáticamente los más antiguos
  - **Garantía:** Siempre mantiene los últimos N documentos, sin importar cuántos se suban

#### Estrategia 2: Límite por Días (Backup)
- **Objetivo:** Eliminar documentos más antiguos que X días
- **Configuración:** `CLEANUP_DAYS_TO_KEEP` (ej: 7 días)
- **Funcionamiento:**
  - Calcula la fecha límite (hoy - X días)
  - Borra todos los documentos y archivos más antiguos que esa fecha
  - Funciona como respaldo por si el límite por cantidad no es suficiente

#### Frecuencia de Ejecución
- **Configuración:** `CLEANUP_INTERVAL_HOURS` (ej: 6 horas)
- Se ejecuta automáticamente cada X horas
- También se ejecuta **inmediatamente al iniciar el servidor**

### 🗑️ Qué se Borra y Qué NO

**✅ Se BORRA:**
- Documentos subidos (`legal_documents` table)
- Análisis asociados (`legal_analysis` table) - por CASCADE
- Archivos físicos en el directorio de almacenamiento

**❌ NO se BORRA:**
- Bases de conocimiento RAG (`knowledge_bases` table)
- Chunks de documentos para búsqueda (`chunks` table)
- Documentos generados guardados (`documents` table)
- Configuración del sistema

### 🌍 Aplicación Multi-País

**Opción A: Límite Global (Actual)**
- Un solo límite para todos los países
- Ejemplo: Mantener últimos 50 documentos globalmente
- **Ventaja:** Simple, no requiere configuración adicional
- **Desventaja:** Si hay muchos usuarios de un país, pueden "consumir" todos los slots

**Opción B: Límite por País (Futuro)**
```env
# Ejemplo: mantener últimos N documentos por país
CLEANUP_MAX_DOCUMENTS_ARGENTINA=50
CLEANUP_MAX_DOCUMENTS_MEXICO=50
CLEANUP_MAX_DOCUMENTS_COLOMBIA=30
CLEANUP_DAYS_TO_KEEP_ARGENTINA=7
CLEANUP_DAYS_TO_KEEP_MEXICO=7
```

**Implementación por país requeriría:**
- Agregar columna `country` o `jurisdiction` a la tabla `legal_documents`
- Modificar queries de cleanup para filtrar por país
- Configurar límites independientes por país

**Recomendación para piloto:**
- Límite global es suficiente para 4-5 usuarios
- Para producción multi-país, implementar límites por país

### 📊 Logs y Monitoreo

El sistema registra cada operación de limpieza:
```
[CLEANUP] ===== Iniciando limpieza completa =====
[CLEANUP] Hay 75 documentos, borrando 25 (manteniendo los últimos 50)
[CLEANUP] Por cantidad: 25 archivos eliminados, 25 registros DB eliminados
[CLEANUP] Por días: 3 archivos eliminados, 3 registros DB eliminados
[CLEANUP] ===== Limpieza completa finalizada =====
[CLEANUP] Total: 28 archivos, 28 registros DB, 0 errores
```

---

## 4️⃣ Monitoring & Metrics (Monitoreo y Métricas)

### 📌 Propósito

Proporcionar visibilidad en tiempo real del estado del sistema, permitiendo detectar problemas antes de que afecten a los usuarios.

### 🔧 Funcionamiento Técnico

**Endpoint:** `GET /metrics` (en el servicio `legal-docs`)

**Datos Retornados:**
```json
{
  "concurrency": {
    "active": 1,           // Análisis activos en este momento
    "max": 3,              // Máximo permitido
    "waiting": 0           // Solicitudes en cola
  },
  "storage": {
    "totalDocuments": 23,           // Total de documentos en DB
    "maxDocuments": 50,            // Límite configurado
    "fileCount": 23,                // Archivos en disco
    "totalSizeMB": "45.23",         // Tamaño total de archivos
    "daysToKeep": 7,                // Días configurados
    "cleanupIntervalHours": 6       // Frecuencia de limpieza
  },
  "timestamp": "2025-01-15T10:00:00Z"
}
```

### 🌍 Aplicación Multi-País

**Opción A: Métricas Globales (Actual)**
- Un solo endpoint muestra estadísticas de todo el sistema
- Útil para monitoreo general

**Opción B: Métricas por País (Futuro)**
```json
{
  "global": { ... },
  "byCountry": {
    "argentina": {
      "totalDocuments": 15,
      "maxDocuments": 50,
      "activeAnalyses": 1
    },
    "mexico": {
      "totalDocuments": 8,
      "maxDocuments": 50,
      "activeAnalyses": 0
    }
  }
}
```

### 📊 Uso Recomendado

- **Durante piloto:** Consultar `/metrics` periódicamente para verificar que el sistema no se está saturando
- **Alertas (futuro):** Integrar con servicios de monitoreo (Datadog, New Relic, etc.) para alertas automáticas
- **Dashboard (futuro):** Crear panel de administración que muestre métricas en tiempo real

---

## 🔄 Flujo Completo de una Solicitud

### Escenario: Usuario sube documento para análisis

1. **Rate Limiting Check**
   - Sistema verifica si la IP del usuario ha excedido el límite de solicitudes
   - Si excede → Rechaza con HTTP 429
   - Si no excede → Continúa

2. **Concurrency Check**
   - Sistema verifica si hay slots disponibles para análisis
   - Si hay slot → Inicia análisis inmediatamente
   - Si no hay slot → Agrega a cola de espera, usuario recibe respuesta indicando que está en cola

3. **Procesamiento**
   - Análisis se ejecuta (puede tomar varios minutos)
   - Usuario recibe actualizaciones de progreso mediante polling

4. **Cleanup (en background)**
   - Cada X horas, el scheduler verifica si hay documentos que exceden los límites
   - Si hay exceso → Borra automáticamente los más antiguos
   - Usuario no se ve afectado (solo se borran documentos antiguos)

5. **Monitoreo**
   - Administrador puede consultar `/metrics` en cualquier momento
   - Ver estado de concurrencia, almacenamiento, etc.

---

## ⚙️ Configuración por Variables de Entorno

### Variables Requeridas

```env
# Rate Limiting (en api service)
# Configurado en código actualmente, pero puede hacerse configurable

# Concurrency (en legal-docs service)
# Configurado en código: MAX_CONCURRENT_ANALYSES = 3
# Puede hacerse configurable con: CONCURRENCY_MAX_ANALYSES=3

# Cleanup (en legal-docs service)
CLEANUP_MAX_DOCUMENTS=50          # Mantener últimos N documentos
CLEANUP_DAYS_TO_KEEP=7            # Mantener archivos de últimos X días
CLEANUP_INTERVAL_HOURS=6          # Ejecutar limpieza cada X horas
STORAGE_DIR=./storage             # Directorio de almacenamiento
```

### Configuraciones Recomendadas por Escenario

#### Piloto Pequeño (4-5 usuarios, 3-4 días)
```env
CLEANUP_MAX_DOCUMENTS=50
CLEANUP_DAYS_TO_KEEP=7
CLEANUP_INTERVAL_HOURS=6
```

#### Piloto Mediano (10-15 usuarios, 1 semana)
```env
CLEANUP_MAX_DOCUMENTS=100
CLEANUP_DAYS_TO_KEEP=7
CLEANUP_INTERVAL_HOURS=3
```

#### Producción Multi-País (futuro)
```env
# Límites globales como base
CLEANUP_MAX_DOCUMENTS_GLOBAL=200
CLEANUP_DAYS_TO_KEEP=14
CLEANUP_INTERVAL_HOURS=6

# Límites por país (si se implementa)
CLEANUP_MAX_DOCUMENTS_ARGENTINA=100
CLEANUP_MAX_DOCUMENTS_MEXICO=100
CLEANUP_MAX_DOCUMENTS_COLOMBIA=50
```

---

## 🌍 Aplicación Multi-País: Consideraciones

### Opción Actual (Sin Modificaciones)

**Ventajas:**
- ✅ Funciona inmediatamente para cualquier país
- ✅ No requiere cambios en código
- ✅ Configuración simple mediante variables de entorno
- ✅ Suficiente para pilotos pequeños

**Limitaciones:**
- ⚠️ Límites son globales (no por país)
- ⚠️ No hay diferenciación de reglas por jurisdicción
- ⚠️ Un país puede "consumir" todos los recursos

### Opción Futura (Con Modificaciones)

**Requisitos para implementar límites por país:**

1. **Base de Datos:**
   - Agregar columna `country` o `jurisdiction` a `legal_documents`
   - Agregar índices para queries eficientes por país

2. **Identificación de País:**
   - Detectar país mediante:
     - Header HTTP personalizado (`X-Country-Code`)
     - Geolocalización IP (servicio externo)
     - Selección explícita del usuario en UI

3. **Lógica de Cleanup:**
   - Modificar `cleanup.ts` para filtrar por país
   - Aplicar límites independientes por país

4. **Lógica de Rate Limiting:**
   - Modificar `rate-limit.ts` para aplicar límites por país
   - Mantener contadores separados por país

5. **Lógica de Concurrency:**
   - Modificar `concurrency-limit.ts` para slots por país
   - O mantener slots globales pero con prioridad por país

**Ejemplo de implementación futura:**
```typescript
// Detectar país desde request
const country = req.headers['x-country-code'] || detectCountryFromIP(req.ip);

// Aplicar límites por país
const maxDocs = process.env[`CLEANUP_MAX_DOCUMENTS_${country.toUpperCase()}`] 
  || process.env.CLEANUP_MAX_DOCUMENTS_GLOBAL 
  || 50;
```

---

## 📊 Métricas de Éxito

### Indicadores Clave (KPIs)

1. **Disponibilidad del Sistema**
   - Objetivo: > 99% uptime durante piloto
   - Métrica: Tiempo de respuesta de `/health`

2. **Tasa de Rechazo por Rate Limit**
   - Objetivo: < 5% de solicitudes rechazadas
   - Métrica: Contador de HTTP 429 vs total de solicitudes

3. **Tiempo de Espera en Cola**
   - Objetivo: < 5 minutos promedio
   - Métrica: Tiempo desde solicitud hasta inicio de análisis

4. **Uso de Almacenamiento**
   - Objetivo: Mantener < 80% de capacidad
   - Métrica: `totalSizeMB` en `/metrics`

5. **Efectividad del Cleanup**
   - Objetivo: Cleanup ejecuta sin errores
   - Métrica: Logs de cleanup sin errores

---

## 🚨 Manejo de Errores y Resiliencia

### Comportamiento en Casos de Error

1. **Si Rate Limiting falla:**
   - Sistema continúa funcionando (falla abierta)
   - Log de error pero no bloquea solicitudes

2. **Si Concurrency Control falla:**
   - Sistema continúa pero sin límite de concurrencia
   - Riesgo de saturación, pero no se cae

3. **Si Cleanup falla:**
   - Sistema continúa funcionando
   - Almacenamiento puede llenarse
   - Log de error para acción manual

4. **Si Monitoring falla:**
   - Sistema continúa funcionando normalmente
   - Solo se pierde visibilidad, no funcionalidad

### Recuperación Automática

- **Rate Limiting:** Se limpia automáticamente cada 5 minutos
- **Concurrency:** Se libera automáticamente al terminar análisis
- **Cleanup:** Se reintenta en el siguiente ciclo programado

---

## 📝 Resumen Ejecutivo

La **Opción B** es una solución de control y estabilidad que:

✅ **Protege el sistema** contra sobrecarga mediante rate limiting y control de concurrencia  
✅ **Mantiene el almacenamiento bajo control** mediante limpieza automática  
✅ **Proporciona visibilidad** mediante métricas en tiempo real  
✅ **Es agnóstica a países** y funciona para uno o múltiples países sin modificaciones  
✅ **No requiere dependencias externas** (Redis, etc.) - todo en memoria  
✅ **Es configurable** mediante variables de entorno sin cambios de código  
✅ **Es resiliente** - errores en componentes de control no derriban el sistema principal  

**Ideal para:**
- Pilotos con 4-15 usuarios
- Períodos de prueba de 3-7 días
- Múltiples países (con límites globales compartidos)
- Escalado futuro a límites por país con modificaciones mínimas

**Limitaciones actuales:**
- Límites son globales (no por país)
- No hay diferenciación de reglas por jurisdicción
- Para producción multi-país a gran escala, se recomienda implementar límites por país

---

## 🔮 Roadmap Futuro

### Fase 1: Mejoras Inmediatas (Post-Piloto)
- [ ] Hacer rate limiting configurable por variables de entorno
- [ ] Hacer concurrency limit configurable por variables de entorno
- [ ] Agregar alertas cuando se acercan límites

### Fase 2: Multi-País Básico
- [ ] Agregar columna `country` a `legal_documents`
- [ ] Implementar detección de país (header o IP)
- [ ] Aplicar límites por país en cleanup

### Fase 3: Multi-País Avanzado
- [ ] Dashboard de administración con métricas por país
- [ ] Rate limiting por país
- [ ] Concurrency limits por país
- [ ] Alertas y notificaciones por país

### Fase 4: Escalabilidad
- [ ] Migrar a Redis para rate limiting distribuido (si se requiere)
- [ ] Implementar load balancing con límites por instancia
- [ ] Integración con servicios de monitoreo externos (Datadog, etc.)
