/**
 * Script TURBO para atualização de TODAS as imagens para TMDB
 * Processamento paralelo para máxima velocidade
 * 
 * Começa a partir de lancamentos.json
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Configurações do TMDB
const TMDB_API_KEY = '15d2ea6d0dc1d476efbca3eba2b9bbfb';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w780';
const DATA_DIR = path.join(__dirname, '..', 'public', 'data');

// Configuração TURBO - processamento paralelo
const CONCURRENT_REQUESTS = 1000; // Requisições simultâneas
const DELAY_BETWEEN_BATCHES = 10; // ms entre batches

// Cache para séries
const seriesCache = new Map();

// Estatísticas
let stats = {
  total: 0,
  updated: 0,
  notFound: 0,
  cached: 0,
  errors: 0
};

// Arquivo para começar (pular arquivos já processados)
const START_FROM = 'drama.json';
let shouldProcess = false;

/**
 * Faz uma requisição HTTPS e retorna uma Promise
 */
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout')), 15000);
    
    const req = https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        clearTimeout(timeout);
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Parse error'));
        }
      });
    });
    
    req.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanTitle(title) {
  if (!title) return '';
  return title
    .replace(/\s*\(\d{4}\)\s*$/, '')
    .replace(/\s*S\d+E\d+.*$/i, '')
    .replace(/\s*EP?\d+.*$/i, '')
    .replace(/\s*-\s*Episódio\s*\d+.*$/i, '')
    .replace(/\s*Temporada\s*\d+.*$/i, '')
    .replace(/[™®©]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isEpisode(name) {
  return /S\d+E\d+|EP?\d+|\bEpisódio\s*\d+/i.test(name);
}

function extractYear(name) {
  const match = name.match(/\((\d{4})\)/);
  return match ? parseInt(match[1]) : null;
}

function normalizeForComparison(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function findBestMatch(results, originalTitle, year) {
  if (!results || results.length === 0) return null;
  const normalizedOriginal = normalizeForComparison(originalTitle);
  
  for (const result of results) {
    const tmdbTitle = result.title || result.name || '';
    const normalizedTmdb = normalizeForComparison(tmdbTitle);
    const tmdbYear = result.release_date?.split('-')[0] || result.first_air_date?.split('-')[0];
    
    if (normalizedTmdb === normalizedOriginal && (!year || tmdbYear === String(year))) {
      return result;
    }
  }
  
  for (const result of results) {
    const tmdbTitle = result.title || result.name || '';
    if (normalizeForComparison(tmdbTitle) === normalizedOriginal) return result;
  }
  
  for (const result of results) {
    if (result.poster_path) return result;
  }
  
  return results[0];
}

/**
 * Busca imagem do TMDB para um item
 */
async function searchTMDBImage(name, type) {
  const cleanedTitle = cleanTitle(name);
  const year = extractYear(name);
  const cacheKey = cleanedTitle.toLowerCase();
  
  // Verifica cache
  if (seriesCache.has(cacheKey)) {
    return { url: seriesCache.get(cacheKey), cached: true };
  }
  
  const itemIsEpisode = isEpisode(name);
  const searchType = itemIsEpisode || type === 'series' ? 'tv' : 'movie';
  const yearParam = year && searchType === 'movie' ? `&year=${year}` : '';
  
  try {
    const searchUrl = `https://api.themoviedb.org/3/search/${searchType}?api_key=${TMDB_API_KEY}&language=pt-BR&query=${encodeURIComponent(cleanedTitle)}${yearParam}`;
    const data = await fetchJSON(searchUrl);
    
    if (data.results?.length > 0) {
      const bestMatch = findBestMatch(data.results, cleanedTitle, year);
      if (bestMatch?.poster_path) {
        const imageUrl = `${TMDB_IMAGE_BASE}${bestMatch.poster_path}`;
        seriesCache.set(cacheKey, imageUrl);
        return { url: imageUrl, cached: false };
      }
    }
    
    // Tenta tipo alternativo
    const altType = searchType === 'tv' ? 'movie' : 'tv';
    const altUrl = `https://api.themoviedb.org/3/search/${altType}?api_key=${TMDB_API_KEY}&language=pt-BR&query=${encodeURIComponent(cleanedTitle)}`;
    const altData = await fetchJSON(altUrl);
    
    if (altData.results?.length > 0) {
      const bestMatch = findBestMatch(altData.results, cleanedTitle, year);
      if (bestMatch?.poster_path) {
        const imageUrl = `${TMDB_IMAGE_BASE}${bestMatch.poster_path}`;
        seriesCache.set(cacheKey, imageUrl);
        return { url: imageUrl, cached: false };
      }
    }
    
    seriesCache.set(cacheKey, null);
    return { url: null, cached: false };
  } catch (error) {
    return { url: null, cached: false, error: true };
  }
}

/**
 * Processa um batch de itens em paralelo
 */
async function processBatch(items, startIndex) {
  const promises = items.map(async (item, i) => {
    const result = await searchTMDBImage(item.name, item.type);
    return { index: startIndex + i, item, result };
  });
  
  return Promise.all(promises);
}

/**
 * Processa um arquivo JSON com batches paralelos
 */
async function processFile(filePath) {
  const fileName = path.basename(filePath);
  
  // Pular até chegar no arquivo de início
  if (!shouldProcess) {
    if (fileName === START_FROM) {
      shouldProcess = true;
    } else {
      console.log(`⏭️  Pulando: ${fileName}`);
      return;
    }
  }
  
  console.log(`\n📁 Processando: ${fileName}`);
  
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const items = JSON.parse(content);
    
    if (!Array.isArray(items)) {
      console.log(`  ⚠️ Não é array, pulando...`);
      return;
    }
    
    console.log(`  📊 Total: ${items.length} itens | Batches de ${CONCURRENT_REQUESTS}`);
    
    let fileUpdated = false;
    let fileStats = { updated: 0, notFound: 0, cached: 0 };
    
    // Processa em batches
    for (let i = 0; i < items.length; i += CONCURRENT_REQUESTS) {
      const batch = items.slice(i, i + CONCURRENT_REQUESTS);
      const batchResults = await processBatch(batch, i);
      
      for (const { index, item, result } of batchResults) {
        stats.total++;
        
        if (result.cached) {
          stats.cached++;
          fileStats.cached++;
        }
        
        if (result.url) {
          if (items[index].logo !== result.url) {
            items[index].logo = result.url;
            fileUpdated = true;
          }
          stats.updated++;
          fileStats.updated++;
        } else {
          stats.notFound++;
          fileStats.notFound++;
        }
        
        if (result.error) stats.errors++;
      }
      
      // Progresso
      const progress = Math.min(i + CONCURRENT_REQUESTS, items.length);
      const percent = Math.round(progress / items.length * 100);
      process.stdout.write(`\r  🚀 ${progress}/${items.length} (${percent}%) | ✅ ${fileStats.updated} | ❌ ${fileStats.notFound} | 📦 ${fileStats.cached} cache`);
      
      // Pequeno delay entre batches
      if (i + CONCURRENT_REQUESTS < items.length) {
        await sleep(DELAY_BETWEEN_BATCHES);
      }
    }
    
    console.log(''); // Nova linha
    
    if (fileUpdated) {
      fs.writeFileSync(filePath, JSON.stringify(items, null, 2), 'utf-8');
      console.log(`  💾 Salvo!`);
    }
    
  } catch (error) {
    console.error(`  ❌ Erro: ${error.message}`);
    stats.errors++;
  }
}

async function main() {
  console.log('🚀 TURBO UPDATE - PROCESSAMENTO PARALELO');
  console.log(`⚡ ${CONCURRENT_REQUESTS} requisições simultâneas`);
  console.log(`📍 Começando de: ${START_FROM}`);
  console.log('==========================================\n');
  
  const files = fs.readdirSync(DATA_DIR)
    .filter(file => file.endsWith('.json') && file !== 'categories.json')
    .map(file => path.join(DATA_DIR, file))
    .sort((a, b) => fs.statSync(a).size - fs.statSync(b).size);
  
  console.log(`📂 ${files.length} arquivos JSON\n`);
  
  const startTime = Date.now();
  
  for (const file of files) {
    await processFile(file);
  }
  
  const duration = Math.round((Date.now() - startTime) / 1000);
  
  console.log('\n==========================================');
  console.log('📊 ESTATÍSTICAS FINAIS');
  console.log('==========================================');
  console.log(`Total processado: ${stats.total}`);
  console.log(`Atualizados: ${stats.updated}`);
  console.log(`Cache hits: ${stats.cached}`);
  console.log(`Não encontrados: ${stats.notFound}`);
  console.log(`Erros: ${stats.errors}`);
  console.log(`Tempo: ${Math.floor(duration / 60)}m ${duration % 60}s`);
  console.log('==========================================\n');
}

main().catch(console.error);
