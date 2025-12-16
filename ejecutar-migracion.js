#!/usr/bin/env node

/**
 * Script para ejecutar migración SQL en Railway
 * Uso: node ejecutar-migracion.js
 */

import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  console.error('❌ Error: DATABASE_URL no está configurada');
  console.log('💡 Ejecuta: railway run node ejecutar-migracion.js');
  process.exit(1);
}

async function runMigration() {
  const client = new Client({ connectionString: dbUrl });
  
  try {
    console.log('🔌 Conectando a la base de datos...');
    await client.connect();
    console.log('✅ Conectado');
    
    // Migración 002: Knowledge Bases (corregida para ambos esquemas)
    console.log('\n📄 Ejecutando migración 002: Knowledge Bases...');
    const sql002 = readFileSync(join(__dirname, 'sql/002_add_knowledge_bases.sql'), 'utf-8');
    await client.query(sql002);
    console.log('✅ Migración 002 completada');
    
    // Migración 003: Legal Documents
    console.log('\n📄 Ejecutando migración 003: Legal Documents...');
    const sql003 = readFileSync(join(__dirname, 'sql/003_legal_documents.sql'), 'utf-8');
    await client.query(sql003);
    console.log('✅ Migración 003 completada');
    
    console.log('\n✅ Todas las migraciones completadas exitosamente!');
    console.log('');
    console.log('📋 Tablas creadas:');
    console.log('  - knowledge_bases');
    console.log('  - chunks.knowledge_base (columna añadida)');
    console.log('  - legal_documents');
    console.log('  - legal_analysis');
    console.log('  - Índices creados');
    
  } catch (error) {
    console.error('❌ Error ejecutando migración:', error.message);
    if (error.message.includes('already exists') || error.message.includes('duplicate')) {
      console.log('ℹ️  Algunas tablas/columnas ya existen, esto es normal');
    } else {
      console.error('Detalles del error:', error);
      process.exit(1);
    }
  } finally {
    await client.end();
    console.log('\n🔌 Conexión cerrada');
  }
}

runMigration();

