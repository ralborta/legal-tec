# Ejecutar Migraciones con Railway CLI

## Paso 1: Autenticarse con Railway CLI

En tu terminal, ejecuta:

```bash
railway login
```

Esto abrirá tu navegador para autenticarte.

## Paso 2: Vincular el proyecto (si es necesario)

Si aún no has vinculado el proyecto:

```bash
railway link
```

Selecciona el proyecto `legal-tec-production` cuando se te pregunte.

## Paso 3: Ejecutar las migraciones

Una vez autenticado, ejecuta:

```bash
railway run node ejecutar-migracion.js
```

Este comando:
- Se conecta automáticamente a la base de datos de Railway usando `DATABASE_URL`
- Ejecuta ambas migraciones (002 y 003)
- Crea las tablas necesarias:
  - `knowledge_bases`
  - `legal_documents`
  - `legal_analysis`
  - Añade columna `knowledge_base` a `chunks`
  - Crea todos los índices necesarios

## Verificación

Para verificar que las tablas se crearon correctamente:

```bash
railway run psql -c "\dt"
```

O para ver las tablas específicas:

```bash
railway run psql -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('knowledge_bases', 'legal_documents', 'legal_analysis');"
```

