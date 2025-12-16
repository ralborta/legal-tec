#!/usr/bin/env node

/**
 * Script para ejecutar migraciones usando Railway API directamente
 * Usa el token de Railway para obtener DATABASE_URL y ejecutar migraciones
 */

import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFile } from 'fs/promises';
import { homedir } from 'os';

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function getRailwayToken() {
  try {
    const configPath = join(homedir(), '.railway', 'config.json');
    const config = JSON.parse(await readFile(configPath, 'utf-8'));
    return config.token;
  } catch (error) {
    console.error('❌ No se pudo leer el token de Railway:', error.message);
    console.log('💡 Ejecuta: railway login');
    process.exit(1);
  }
}

async function getDatabaseUrlFromRailway(token) {
  try {
    // Railway API endpoint para obtener variables de entorno
    // Necesitamos el project ID primero
    const projectsResponse = await fetch('https://api.railway.app/v1/projects', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!projectsResponse.ok) {
      throw new Error(`Railway API error: ${projectsResponse.status} ${projectsResponse.statusText}`);
    }

    const projects = await projectsResponse.json();
    if (!projects.projects || projects.projects.length === 0) {
      throw new Error('No se encontraron proyectos en Railway');
    }

    // Buscar el proyecto "legal-tec" o usar el primero
    const project = projects.projects.find(p => 
      p.name?.toLowerCase().includes('legal') || 
      p.name?.toLowerCase().includes('tec')
    ) || projects.projects[0];

    console.log(`📦 Usando proyecto: ${project.name}`);

    // Obtener servicios del proyecto
    const servicesResponse = await fetch(
      `https://api.railway.app/v1/projects/${project.id}/services`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!servicesResponse.ok) {
      throw new Error(`Error obteniendo servicios: ${servicesResponse.status}`);
    }

    const services = await servicesResponse.json();
    if (!services.services || services.services.length === 0) {
      throw new Error('No se encontraron servicios en el proyecto');
    }

    // Buscar servicio "legal-tec" o "api-gateway" o usar el primero
    const service = services.services.find(s => 
      s.name?.toLowerCase().includes('legal-tec') ||
      s.name?.toLowerCase().includes('api-gateway') ||
      s.name?.toLowerCase().includes('production')
    ) || services.services[0];

    console.log(`🔧 Usando servicio: ${service.name}`);

    // Obtener variables de entorno
    const varsResponse = await fetch(
      `https://api.railway.app/v1/services/${service.id}/variables`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!varsResponse.ok) {
      throw new Error(`Error obteniendo variables: ${varsResponse.status}`);
    }

    const vars = await varsResponse.json();
    const dbUrl = vars.variables?.find(v => v.name === 'DATABASE_URL')?.value;

    if (!dbUrl) {
      throw new Error('DATABASE_URL no encontrada en Railway');
    }

    return dbUrl;
  } catch (error) {
    console.error('❌ Error obteniendo DATABASE_URL de Railway:', error.message);
    throw error;
  }
}

async function runMigration() {
  try {
    console.log('🔑 Obteniendo token de Railway...');
    const token = await getRailwayToken();
    console.log('✅ Token obtenido');

    console.log('🌐 Obteniendo DATABASE_URL de Railway...');
    const dbUrl = await getDatabaseUrlFromRailway(token);
    console.log('✅ DATABASE_URL obtenida');

    const client = new Client({ connectionString: dbUrl });
    
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
    if (client) {
      await client.end();
      console.log('\n🔌 Conexión cerrada');
    }
  }
}

runMigration();

