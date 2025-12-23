import "dotenv/config";
import * as knowledgeBases from "./knowledge-bases.js";
import { scrapeAndIngestUrls } from "./url-scraper.js";

/**
 * Script para scrapear las URLs nacionales argentinas y guardarlas en la base de conocimiento
 * Ejecutar con: npm run seed-urls
 */

const URLS_NACIONALES = [
  {
    url: "https://www.boletinoficial.gob.ar/",
    name: "Boletín Oficial de la República Argentina"
  },
  {
    url: "https://www.argentina.gob.ar/normativa",
    name: "InfoLEG - Información Legislativa y Documental"
  },
  {
    url: "http://www.csjn.gov.ar/siprojur/",
    name: "SIPROJUD - Sistema de Información Jurídica del Poder Judicial"
  },
  {
    url: "http://www.bibliotecadigital.gob.ar/items/show/2690",
    name: "Código Civil y Comercial"
  },
  {
    url: "https://www.saij.gob.ar/7425-local-buenos-aires-codigo-procesal-civil-comercial-buenos-aires-lpb0007425-1968-09-19/123456789-0abc-defg-524-7000bvorpyel",
    name: "Código Procesal Civil y Comercial"
  },
  {
    url: "https://www.argentina.gob.ar/justicia/saij",
    name: "SAIJ - Jurisprudencia"
  },
  {
    url: "https://www.hcdn.gob.ar/",
    name: "Honorable Cámara de Diputados de la Nación"
  },
  {
    url: "https://www.senado.gob.ar/",
    name: "Senado de la Nación Argentina"
  }
];

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!dbUrl || !openaiKey) {
    console.error("❌ Faltan variables de entorno: DATABASE_URL o OPENAI_API_KEY");
    process.exit(1);
  }

  const knowledgeBaseId = "normativa_nacional_urls";
  const knowledgeBaseName = "Normativa Nacional (URLs)";

  console.log("🚀 Iniciando scraping de URLs nacionales...\n");

  // Crear o verificar que existe la base de conocimiento
  try {
    const existing = await knowledgeBases.getKnowledgeBase(dbUrl, knowledgeBaseId);
    if (!existing) {
      console.log(`📚 Creando base de conocimiento: ${knowledgeBaseName}`);
      await knowledgeBases.upsertKnowledgeBase(dbUrl, {
        id: knowledgeBaseId,
        name: knowledgeBaseName,
        description: "Contenido scrapeado de URLs de recursos legales nacionales argentinos",
        sourceType: "normativa",
        enabled: true,
        metadata: {
          urls: URLS_NACIONALES.map(u => u.url),
          createdAt: new Date().toISOString()
        }
      });
      console.log("✅ Base de conocimiento creada\n");
    } else {
      console.log(`✅ Base de conocimiento ya existe: ${knowledgeBaseName}\n`);
    }
  } catch (error) {
    console.error("❌ Error al crear base de conocimiento:", error);
    process.exit(1);
  }

  // Scrapear todas las URLs
  const urls = URLS_NACIONALES.map(u => u.url);
  
  console.log(`📥 Scrapeando ${urls.length} URLs...\n`);
  
  const result = await scrapeAndIngestUrls(
    dbUrl,
    openaiKey,
    urls,
    knowledgeBaseId,
    "normativa"
  );

  // Mostrar resultados
  console.log("\n" + "=".repeat(60));
  console.log("📊 RESULTADOS DEL SCRAPING");
  console.log("=".repeat(60));
  console.log(`✅ Exitosos: ${result.success}`);
  console.log(`❌ Fallidos: ${result.failed}`);
  console.log("\nDetalles por URL:\n");

  result.results.forEach((r, i) => {
    const info = URLS_NACIONALES[i];
    console.log(`${i + 1}. ${info.name}`);
    console.log(`   URL: ${r.url}`);
    if (r.success) {
      console.log(`   ✅ Éxito - Título: ${r.title.substring(0, 60)}...`);
      console.log(`   📄 Texto extraído: ${r.text.length} caracteres`);
    } else {
      console.log(`   ❌ Error: ${r.error}`);
    }
    console.log("");
  });

  console.log("=".repeat(60));
  console.log("\n✨ Proceso completado!");
  console.log(`\n💡 Las URLs ahora están disponibles en la base de conocimiento "${knowledgeBaseId}"`);
  console.log("   Podés usarlas en la generación de documentos seleccionando esta base.\n");
}

main().catch((error) => {
  console.error("❌ Error fatal:", error);
  process.exit(1);
});










