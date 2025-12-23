import * as cheerio from "cheerio";
import { ingestBatch } from "./ingest.js";

/**
 * Scraping de URLs públicas para incluir en RAG
 * Extrae el contenido textual de páginas web y lo guarda en la base de conocimiento
 */

export interface ScrapeResult {
  url: string;
  title: string;
  text: string;
  success: boolean;
  error?: string;
}

/**
 * Scrapea una URL y extrae el contenido textual
 */
export async function scrapeUrl(url: string): Promise<ScrapeResult> {
  try {
    // Hacer request HTTP
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      // Timeout de 30 segundos
      signal: AbortSignal.timeout(30000)
    });

    if (!response.ok) {
      return {
        url,
        title: "Error",
        text: "",
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`
      };
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Extraer título
    const title = $('title').text().trim() || 
                  $('h1').first().text().trim() || 
                  url.split('/').pop() || 
                  url;

    // Remover scripts, styles, y otros elementos no deseados
    $('script, style, nav, header, footer, aside, .advertisement, .ads').remove();

    // Extraer texto principal
    // Intentar encontrar el contenido principal
    let text = '';
    
    // Buscar en elementos comunes de contenido
    const contentSelectors = [
      'main',
      'article',
      '.content',
      '.main-content',
      '#content',
      '.post',
      '.entry-content',
      'body'
    ];

    for (const selector of contentSelectors) {
      const content = $(selector).first();
      if (content.length > 0 && content.text().trim().length > 100) {
        text = content.text().trim();
        break;
      }
    }

    // Si no encontramos contenido específico, usar body completo
    if (!text || text.length < 100) {
      text = $('body').text().trim();
    }

    // Limpiar el texto: remover espacios múltiples, saltos de línea excesivos
    text = text
      .replace(/\s+/g, ' ') // Múltiples espacios a uno
      .replace(/\n\s*\n/g, '\n\n') // Múltiples saltos de línea a dos
      .trim();

    // Limitar tamaño (primeros 50K caracteres para no exceder límites)
    if (text.length > 50000) {
      text = text.substring(0, 50000) + '... [contenido truncado]';
    }

    return {
      url,
      title,
      text,
      success: true
    };

  } catch (error: any) {
    return {
      url,
      title: "Error",
      text: "",
      success: false,
      error: error.message || "Error desconocido al scrapear"
    };
  }
}

/**
 * Scrapea múltiples URLs y las guarda en la base de conocimiento
 */
export async function scrapeAndIngestUrls(
  dbUrl: string,
  openaiKey: string,
  urls: string[],
  knowledgeBaseId: string,
  sourceType: string = "normativa"
): Promise<{
  success: number;
  failed: number;
  results: ScrapeResult[];
}> {
  const results: ScrapeResult[] = [];
  let success = 0;
  let failed = 0;

  // Scrapear todas las URLs
  for (const url of urls) {
    console.log(`Scrapeando: ${url}`);
    const result = await scrapeUrl(url);
    results.push(result);
    
    if (result.success) {
      success++;
    } else {
      failed++;
      console.error(`Error scrapeando ${url}:`, result.error);
    }

    // Pequeño delay entre requests para no sobrecargar
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Ingresar solo los exitosos a la DB
  const successfulResults = results.filter(r => r.success && r.text.length > 100);
  
  if (successfulResults.length > 0) {
    const items = successfulResults.map(result => ({
      text: result.text,
      source: sourceType,
      title: result.title,
      url: result.url,
      knowledgeBase: knowledgeBaseId,
      meta: {
        scrapedAt: new Date().toISOString(),
        source: "web_scraping"
      }
    }));

    await ingestBatch(dbUrl, openaiKey, items);
    console.log(`Ingresados ${items.length} documentos a la base de conocimiento ${knowledgeBaseId}`);
  }

  return {
    success,
    failed,
    results
  };
}










