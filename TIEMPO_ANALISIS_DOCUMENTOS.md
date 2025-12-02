# ⏱️ Tiempo de Análisis de Documentos Legales

## ¿Es Normal que Tarde?

**Sí, es completamente normal que el análisis tarde entre 30-90 segundos** dependiendo del tamaño del documento.

## ¿Por Qué Tarda?

El pipeline realiza **4-5 llamadas secuenciales a OpenAI** (GPT-4o-mini), cada una puede tardar:

1. **OCR Agent** (5-10 segundos)
   - Extrae texto del PDF
   - Puede ser más rápido si el PDF tiene texto seleccionable

2. **Translator Agent** (10-20 segundos)
   - Traduce y estructura todas las cláusulas
   - Depende del tamaño del documento

3. **Classifier Agent** (5-10 segundos)
   - Clasifica el tipo de documento
   - Análisis rápido

4. **Distribution Analyzer** (15-30 segundos)
   - Analiza 8 puntos críticos del contrato
   - El paso más lento (solo para contratos de distribución)

5. **Report Agent** (15-30 segundos)
   - Genera el reporte legal completo
   - Procesa toda la información

**Total estimado: 50-100 segundos** para un documento promedio.

## Optimizaciones Implementadas

✅ **Análisis asíncrono**: El análisis se dispara y se consulta después
✅ **Modelo eficiente**: Usa `gpt-4o-mini` en lugar de `gpt-4` (más rápido y económico)
✅ **Polling inteligente**: La UI consulta cada 3 segundos
✅ **Feedback visual**: Muestra progreso mientras analiza

## Mejoras Futuras

- [ ] Paralelizar algunas llamadas (si no hay dependencias)
- [ ] Cachear resultados de documentos similares
- [ ] Streaming de resultados parciales
- [ ] Webhooks para notificar cuando termine

## Recomendaciones

- **Documentos pequeños** (< 10 páginas): 30-50 segundos
- **Documentos medianos** (10-30 páginas): 50-80 segundos  
- **Documentos grandes** (> 30 páginas): 80-120 segundos

Si tarda más de 2 minutos, puede haber un problema. Revisar logs del servicio.

