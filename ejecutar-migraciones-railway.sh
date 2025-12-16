#!/bin/bash
echo "🚀 Ejecutando migraciones en Railway..."
echo ""
echo "Este script ejecutará las migraciones SQL usando Railway CLI"
echo "Asegúrate de estar autenticado con: railway login"
echo ""
railway run node ejecutar-migracion.js
