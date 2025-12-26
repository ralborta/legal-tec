# 🧹 Sistema de Cleanup Automático para Piloto

## 🎯 Objetivo

Mantener la base de datos y el almacenamiento bajo control durante el piloto con 4-5 abogados, evitando que se llene el disco o la DB.

## ⚙️ Cómo Funciona

El sistema tiene **2 estrategias de limpieza** que funcionan juntas:

### 1. **Límite por Cantidad** (Principal para piloto)
- **Mantiene solo los últimos N documentos** (por defecto: 50)
- Si hay más de 50 documentos, borra los más antiguos automáticamente
- **Ventaja**: No importa cuántos documentos suban, siempre mantiene los últimos 50

### 2. **Límite por Días** (Backup)
- Borra documentos más antiguos que X días (por defecto: 7 días)
- Funciona como respaldo por si el límite por cantidad no es suficiente

### 3. **Frecuencia de Limpieza**
- Se ejecuta automáticamente cada 6 horas (configurable)
- También se ejecuta al iniciar el servidor

## 📊 Variables de Entorno

Configurar en Railway (legal-docs service):

```bash
# Cantidad máxima de documentos a mantener (últimos N)
CLEANUP_MAX_DOCUMENTS=50

# Días a mantener (backup)
CLEANUP_DAYS_TO_KEEP=7

# Frecuencia de limpieza (en horas)
CLEANUP_INTERVAL_HOURS=6
```

## 📈 Monitoreo

### Endpoint de Métricas

```bash
GET /metrics
```

Respuesta:
```json
{
  "concurrency": {
    "active": 1,
    "max": 3,
    "waiting": 0
  },
  "storage": {
    "totalDocuments": 23,
    "maxDocuments": 50,
    "fileCount": 23,
    "totalSizeMB": "45.23",
    "daysToKeep": 7,
    "cleanupIntervalHours": 6
  },
  "timestamp": "2025-01-15T10:00:00Z"
}
```

## 🔍 Verificar Estado Actual

### Opción 1: Desde el código (endpoint)

```bash
curl https://legal-docs-production.up.railway.app/metrics
```

### Opción 2: Desde Railway

1. Ir a Railway → legal-docs service → **Logs**
2. Buscar líneas que empiezan con `[CLEANUP]`
3. Verás mensajes como:
   - `[CLEANUP] Hay 23 documentos, no se excede el límite de 50`
   - `[CLEANUP] Hay 75 documentos, borrando 25 (manteniendo los últimos 50)`

## ⚠️ Recomendaciones para el Piloto

### Configuración Conservadora (Recomendada)
```bash
CLEANUP_MAX_DOCUMENTS=50      # Mantiene últimos 50 documentos
CLEANUP_DAYS_TO_KEEP=7        # 7 días de backup
CLEANUP_INTERVAL_HOURS=6      # Limpia cada 6 horas
```

### Configuración Más Agresiva (Si hay muchos documentos)
```bash
CLEANUP_MAX_DOCUMENTS=30      # Mantiene solo últimos 30
CLEANUP_DAYS_TO_KEEP=3        # Solo 3 días de backup
CLEANUP_INTERVAL_HOURS=3      # Limpia cada 3 horas
```

### Configuración Permisiva (Si quieren guardar más)
```bash
CLEANUP_MAX_DOCUMENTS=100     # Mantiene últimos 100
CLEANUP_DAYS_TO_KEEP=14       # 14 días de backup
CLEANUP_INTERVAL_HOURS=12     # Limpia cada 12 horas
```

## 🛡️ Seguridad

- ✅ **No borra datos de RAG** (`chunks` table)
- ✅ **No borra documentos generados** (`documents` table)
- ✅ **No borra configuración** (`knowledge_bases` table)
- ✅ **Solo borra documentos subidos y sus análisis** (`legal_documents` y `legal_analysis`)
- ✅ **Mantiene siempre los documentos más recientes**

## 🔄 Qué Pasa Cuando se Llena

1. **Si hay más de MAX_DOCUMENTS:**
   - El sistema automáticamente borra los más antiguos
   - Mantiene solo los últimos N documentos
   - Se ejecuta cada X horas automáticamente

2. **Si el disco se llena:**
   - El cleanup también limpia archivos físicos
   - Pero si el disco está muy lleno, puede fallar el upload
   - **Solución**: Reducir `CLEANUP_MAX_DOCUMENTS` o `CLEANUP_DAYS_TO_KEEP`

## 📝 Logs Importantes

Buscar en logs de Railway:
- `[CLEANUP] Scheduler iniciado` - Confirma que el sistema está activo
- `[CLEANUP] Hay X documentos, borrando Y` - Limpieza en acción
- `[CLEANUP] Total: X archivos, Y registros DB` - Resumen de limpieza

## 🚨 Alertas

Si ves estos mensajes, el sistema está funcionando:
- ✅ `[CLEANUP] Hay X documentos, no se excede el límite` - Todo bien
- ⚠️ `[CLEANUP] Hay X documentos, borrando Y` - Limpieza automática activa
- ❌ `[CLEANUP] Error en limpieza` - Revisar logs para detalles

