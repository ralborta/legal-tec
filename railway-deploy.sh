#!/bin/bash

# Script para verificar configuración antes de deploy en Railway
# Ejecutar: bash railway-deploy.sh

echo "🔍 Verificando configuración para deploy en Railway..."
echo ""

# Verificar que existe el directorio
if [ ! -d "apps/legal-docs" ]; then
    echo "❌ Error: No existe apps/legal-docs"
    exit 1
fi

echo "✅ Directorio apps/legal-docs existe"

# Verificar package.json
if [ ! -f "apps/legal-docs/package.json" ]; then
    echo "❌ Error: No existe apps/legal-docs/package.json"
    exit 1
fi

echo "✅ package.json existe"

# Verificar que tiene scripts de build y start
if ! grep -q '"build"' apps/legal-docs/package.json; then
    echo "⚠️  Advertencia: No se encontró script 'build' en package.json"
fi

if ! grep -q '"start"' apps/legal-docs/package.json; then
    echo "⚠️  Advertencia: No se encontró script 'start' en package.json"
fi

echo "✅ Scripts verificados"

# Verificar archivos principales
FILES=(
    "apps/legal-docs/src/index.ts"
    "apps/legal-docs/src/pipeline.ts"
    "apps/legal-docs/src/db.ts"
    "apps/legal-docs/src/storage.ts"
)

for file in "${FILES[@]}"; do
    if [ ! -f "$file" ]; then
        echo "❌ Error: No existe $file"
        exit 1
    fi
done

echo "✅ Archivos principales verificados"

# Verificar SQL migration
if [ ! -f "sql/003_legal_documents.sql" ]; then
    echo "⚠️  Advertencia: No existe sql/003_legal_documents.sql"
else
    echo "✅ Migración SQL existe"
fi

echo ""
echo "✅ Todo listo para deploy!"
echo ""
echo "📋 Próximos pasos:"
echo "1. Crear nuevo servicio en Railway"
echo "2. Root Directory: apps/legal-docs"
echo "3. Build Command: cd apps/legal-docs && npm install && npm run build"
echo "4. Start Command: cd apps/legal-docs && npm start"
echo "5. Variables: DATABASE_URL, OPENAI_API_KEY, STORAGE_DIR=./storage"
echo "6. Agregar LEGAL_DOCS_URL en api-gateway con la URL del nuevo servicio"
echo ""

