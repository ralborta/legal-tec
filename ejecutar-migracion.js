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
    
    console.log('📄 Leyendo archivo SQL...');
    const sql = readFileSync(join(__dirname, 'sql/003_legal_documents.sql'), 'utf-8');
    
    console.log('🚀 Ejecutando migración...');
    await client.query(sql);
    
    console.log('✅ Migración completada exitosamente!');
    console.log('');
    console.log('📋 Tablas creadas:');
    console.log('  - legal_documents');
    console.log('  - legal_analysis');
    console.log('  - Índices creados');
    
  } catch (error) {
    console.error('❌ Error ejecutando migración:', error.message);
    if (error.message.includes('already exists')) {
      console.log('ℹ️  Las tablas ya existen, esto es normal');
    } else {
      process.exit(1);
    }
  } finally {
    await client.end();
  }
}

runMigration();

