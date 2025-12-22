#!/usr/bin/env node
/**
 * Script de diagnóstico para verificar qué pasa con los análisis
 * Ejecutar: node diagnostico-analisis.js
 */

import pg from "pg";
const { Client } = pg;

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL no configurada");
  process.exit(1);
}

const client = new Client({ connectionString: DATABASE_URL });

async function diagnosticar() {
  try {
    await client.connect();
    console.log("✅ Conectado a la base de datos\n");

    // 1. Verificar que las tablas existen
    console.log("📊 Verificando tablas...");
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('legal_documents', 'legal_analysis')
      ORDER BY table_name
    `);
    
    console.log(`   Tablas encontradas: ${tables.rows.map(r => r.table_name).join(", ") || "NINGUNA"}`);
    
    if (tables.rows.length === 0) {
      console.log("❌ Las tablas no existen. Necesitas ejecutar las migraciones SQL.");
      return;
    }

    // 2. Contar documentos
    console.log("\n📄 Documentos en legal_documents:");
    const docs = await client.query(`
      SELECT 
        id, 
        filename, 
        status, 
        progress, 
        error_message,
        created_at 
      FROM legal_documents 
      ORDER BY created_at DESC 
      LIMIT 10
    `);
    
    console.log(`   Total: ${docs.rows.length} documentos (mostrando últimos 10)`);
    docs.rows.forEach((doc, i) => {
      console.log(`   ${i + 1}. ${doc.filename}`);
      console.log(`      ID: ${doc.id}`);
      console.log(`      Estado: ${doc.status || "N/A"}`);
      console.log(`      Progreso: ${doc.progress || 0}%`);
      if (doc.error_message) {
        console.log(`      ❌ Error: ${doc.error_message}`);
      }
      console.log(`      Creado: ${doc.created_at}`);
      console.log("");
    });

    // 3. Contar análisis
    console.log("🔍 Análisis en legal_analysis:");
    const analyses = await client.query(`
      SELECT 
        document_id, 
        type, 
        created_at,
        CASE 
          WHEN report IS NULL THEN 'SIN REPORTE'
          WHEN report = '' THEN 'REPORTE VACÍO'
          ELSE 'CON REPORTE'
        END as report_status
      FROM legal_analysis 
      ORDER BY created_at DESC 
      LIMIT 10
    `);
    
    console.log(`   Total: ${analyses.rows.length} análisis (mostrando últimos 10)`);
    analyses.rows.forEach((analysis, i) => {
      console.log(`   ${i + 1}. Document ID: ${analysis.document_id}`);
      console.log(`      Tipo: ${analysis.type}`);
      console.log(`      Reporte: ${analysis.report_status}`);
      console.log(`      Creado: ${analysis.created_at}`);
      console.log("");
    });

    // 4. Verificar documentos SIN análisis
    console.log("⚠️  Documentos SIN análisis:");
    const sinAnalisis = await client.query(`
      SELECT d.id, d.filename, d.status, d.progress, d.error_message, d.created_at
      FROM legal_documents d
      LEFT JOIN legal_analysis a ON d.id = a.document_id
      WHERE a.document_id IS NULL
      ORDER BY d.created_at DESC
      LIMIT 10
    `);
    
    if (sinAnalisis.rows.length === 0) {
      console.log("   ✅ Todos los documentos tienen análisis");
    } else {
      console.log(`   ❌ ${sinAnalisis.rows.length} documentos sin análisis:`);
      sinAnalisis.rows.forEach((doc, i) => {
        console.log(`   ${i + 1}. ${doc.filename} (${doc.id})`);
        console.log(`      Estado: ${doc.status || "N/A"}, Progreso: ${doc.progress || 0}%`);
        if (doc.error_message) {
          console.log(`      Error: ${doc.error_message}`);
        }
      });
    }

    // 5. Verificar estructura de un análisis completo
    console.log("\n🔬 Ejemplo de análisis completo (último):");
    const ejemplo = await client.query(`
      SELECT 
        d.id,
        d.filename,
        d.status,
        a.type as analysis_type,
        a.original,
        a.translated,
        a.checklist,
        a.report,
        a.created_at as analyzed_at
      FROM legal_documents d
      LEFT JOIN legal_analysis a ON d.id = a.document_id
      WHERE a.document_id IS NOT NULL
      ORDER BY a.created_at DESC
      LIMIT 1
    `);
    
    if (ejemplo.rows.length > 0) {
      const row = ejemplo.rows[0];
      console.log(`   Documento: ${row.filename}`);
      console.log(`   ID: ${row.id}`);
      console.log(`   Estado: ${row.status}`);
      console.log(`   Tipo análisis: ${row.analysis_type}`);
      console.log(`   Original: ${row.original ? "✅ (JSONB)" : "❌ NULL"}`);
      console.log(`   Translated: ${row.translated ? "✅ (JSONB)" : "❌ NULL"}`);
      console.log(`   Checklist: ${row.checklist ? "✅ (JSONB)" : "❌ NULL"}`);
      console.log(`   Report: ${row.report ? `✅ (${typeof row.report === 'string' ? row.report.substring(0, 100) + '...' : 'OBJETO'})` : "❌ NULL"}`);
      console.log(`   Analizado: ${row.analyzed_at}`);
      
      // Intentar parsear el report si es string
      if (row.report && typeof row.report === 'string') {
        try {
          const parsed = JSON.parse(row.report);
          console.log(`   Report parseado: ✅ (tiene ${Object.keys(parsed).length} campos)`);
        } catch (e) {
          console.log(`   Report parseado: ❌ Error: ${e.message}`);
        }
      }
    } else {
      console.log("   ❌ No hay análisis completos para mostrar");
    }

    // 6. Verificar schema de legal_analysis
    console.log("\n📋 Schema de legal_analysis:");
    const schema = await client.query(`
      SELECT 
        column_name, 
        data_type, 
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_name = 'legal_analysis'
      ORDER BY ordinal_position
    `);
    
    schema.rows.forEach(col => {
      console.log(`   ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? '(NOT NULL)' : '(nullable)'}`);
    });

  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error(error);
  } finally {
    await client.end();
  }
}

diagnosticar();

