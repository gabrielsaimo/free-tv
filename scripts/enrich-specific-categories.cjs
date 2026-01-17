/**
 * Script para enriquecer categorias específicas
 * Baseado no enrich-movies-turbo.cjs mas processa apenas as categorias especificadas
 */

const fs = require('fs');
const path = require('path');

// ============================================
// CONFIGURAÇÃO
// ============================================
const TMDB_API_KEY = '15d2ea6d0dc1d476efbca3eba2b9bbfb';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

const PARALLEL_REQUESTS = 50;
const DELAY_BETWEEN_BATCHES = 500;

const DATA_DIR = path.join(__dirname, '../public/data');
const OUTPUT_DIR = path.join(__dirname, '../public/data/enriched');

// Categorias para processar (passadas via args ou lista padrão)
const CATEGORIES = process.argv.slice(2).length > 0 
  ? process.argv.slice(2).map(c => c.replace('.json', ''))
  : ['oscar-2025', 'outros', 'uhd-4k'];

const searchCache = new Map();
let stats = {
  total: 0,
  processed: 0,
  found: 0,
  notFound: 0,
  cached: 0,
  errors: 0,
  startTime: Date.now()
};

// ============================================
// FUNÇÕES UTILITÁRIAS
// ============================================

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function cleanTitle(name) {
  return name
    .replace(/^\[.*?\]\s*/g, '')
    .replace(/^📺\s*/g, '')
    .replace(/^🎬\s*/g, '')
    .replace(/\s*\(\d{4}\)\s*/g, '')
    .replace(/\s*\[CAM\]/gi, '')
    .replace(/\s*\[CINEMA\]/gi, '')
    .replace(/\s*\[HD\]/gi, '')
    .replace(/\s*\[4K\]/gi, '')
    .replace(/\s*-\s*Dublado.*/i, '')
    .replace(/\s*-\s*Legendado.*/i, '')
    .replace(/\s*\[.*?\]/g, '')
    .replace(/\s*\[L\]\s*/g, '')
    .replace(/\s*DUB\s*$/i, '')
    .replace(/\s*LEG\s*$/i, '')
    .replace(/[_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractYear(name) {
  const match = name.match(/\((\d{4})\)/);
  return match ? parseInt(match[1], 10) : null;
}

function normalizeForComparison(str) {
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function calculateMatchScore(result, searchTitle, targetYear) {
  let score = 0;
  const title = result.title || result.name || '';
  const originalTitle = result.original_title || result.original_name || '';
  const normalizedSearch = normalizeForComparison(searchTitle);
  const normalizedTitle = normalizeForComparison(title);
  const normalizedOriginal = normalizeForComparison(originalTitle);
  
  if (normalizedTitle === normalizedSearch || normalizedOriginal === normalizedSearch) score += 50;
  else if (normalizedTitle.includes(normalizedSearch) || normalizedOriginal.includes(normalizedSearch)) score += 30;
  
  const resultYear = result.release_date || result.first_air_date;
  if (resultYear && targetYear) {
    const year = parseInt(resultYear.substring(0, 4), 10);
    if (year === targetYear) score += 40;
    else if (Math.abs(year - targetYear) <= 1) score += 20;
  }
  
  if (result.vote_count > 100) score += 5;
  if (result.vote_count > 1000) score += 5;
  
  return score;
}

function findBestMatch(results, searchTitle, targetYear) {
  if (!results || results.length === 0) return null;
  const scored = results.map(r => ({ result: r, score: calculateMatchScore(r, searchTitle, targetYear) }));
  scored.sort((a, b) => b.score - a.score);
  if (scored[0].score > 0) return scored[0].result;
  return results.find(r => r.poster_path) || results[0];
}

function img(path, type = 'poster', size = 'large') {
  if (!path) return null;
  const sizes = {
    poster: { s: 'w185', m: 'w342', l: 'w500', o: 'original' },
    backdrop: { s: 'w300', m: 'w780', l: 'w1280', o: 'original' },
    profile: { s: 'w45', m: 'w185', l: 'h632', o: 'original' },
    logo: { s: 'w92', m: 'w185', l: 'w500', o: 'original' }
  };
  const s = size === 'small' ? 's' : size === 'medium' ? 'm' : size === 'original' ? 'o' : 'l';
  return `${TMDB_IMAGE_BASE}/${sizes[type]?.[s] || 'w500'}${path}`;
}

async function searchTMDB(title, year = null, type = 'movie') {
  const cacheKey = `${title}_${year}_${type}`;
  if (searchCache.has(cacheKey)) {
    stats.cached++;
    return searchCache.get(cacheKey);
  }
  
  try {
    const endpoint = type === 'series' ? 'search/tv' : 'search/movie';
    const params = new URLSearchParams({
      api_key: TMDB_API_KEY,
      query: title,
      language: 'pt-BR',
      include_adult: false
    });
    
    if (year) params.append('year', year.toString());
    
    const response = await fetch(`${TMDB_BASE}/${endpoint}?${params}`);
    if (!response.ok) return null;
    
    const data = await response.json();
    const bestMatch = findBestMatch(data.results, title, year);
    
    if (!bestMatch) {
      searchCache.set(cacheKey, null);
      return null;
    }
    
    // Busca detalhes completos
    const detailEndpoint = type === 'series' ? `tv/${bestMatch.id}` : `movie/${bestMatch.id}`;
    const detailParams = new URLSearchParams({
      api_key: TMDB_API_KEY,
      language: 'pt-BR',
      append_to_response: 'credits,images,videos,content_ratings,release_dates'
    });
    
    const detailResponse = await fetch(`${TMDB_BASE}/${detailEndpoint}?${detailParams}`);
    if (!detailResponse.ok) {
      searchCache.set(cacheKey, bestMatch);
      return bestMatch;
    }
    
    const details = await detailResponse.json();
    searchCache.set(cacheKey, details);
    return details;
  } catch (error) {
    stats.errors++;
    return null;
  }
}

function convertCert(cert, isTV = false) {
  if (!cert) return null;
  if (isTV) return { 'TV-Y': 'L', 'TV-Y7': 'L', 'TV-G': 'L', 'TV-PG': '10', 'TV-14': '14', 'TV-MA': '18' }[cert] || cert;
  return { 'G': 'L', 'PG': '10', 'PG-13': '12', 'R': '16', 'NC-17': '18' }[cert] || cert;
}

function getCertification(details, isTV = false) {
  if (isTV && details.content_ratings?.results) {
    const us = details.content_ratings.results.find(r => r.iso_3166_1 === 'US');
    return us ? convertCert(us.rating, true) : null;
  }
  if (!isTV && details.release_dates?.results) {
    const us = details.release_dates.results.find(r => r.iso_3166_1 === 'US');
    const cert = us?.release_dates?.[0]?.certification;
    return cert ? convertCert(cert, false) : null;
  }
  return null;
}

async function enrichItem(item) {
  const title = cleanTitle(item.name);
  const year = extractYear(item.name);
  const isTV = item.type === 'series';
  
  const details = await searchTMDB(title, year, isTV ? 'series' : 'movie');
  
  if (!details) {
    stats.notFound++;
    return item;
  }
  
  stats.found++;
  
  const enriched = {
    ...item,
    tmdb: {
      id: details.id,
      imdbId: details.imdb_id || null,
      title: details.title || details.name,
      originalTitle: details.original_title || details.original_name,
      tagline: details.tagline || null,
      overview: details.overview || null,
      status: details.status,
      language: details.original_language,
      releaseDate: details.release_date || details.first_air_date || null,
      year: details.release_date ? details.release_date.substring(0, 4) : 
            details.first_air_date ? details.first_air_date.substring(0, 4) : null,
      runtime: details.runtime || (details.episode_run_time ? details.episode_run_time[0] : null) || null,
      rating: details.vote_average || 0,
      voteCount: details.vote_count || 0,
      popularity: details.popularity || 0,
      certification: getCertification(details, isTV),
      genres: details.genres ? details.genres.map(g => g.name) : [],
      poster: img(details.poster_path, 'poster', 'large'),
      posterHD: img(details.poster_path, 'poster', 'original'),
      backdrop: img(details.backdrop_path, 'backdrop', 'large'),
      backdropHD: img(details.backdrop_path, 'backdrop', 'original'),
      logo: details.images?.logos?.[0] ? img(details.images.logos[0].file_path, 'logo', 'large') : null,
      cast: details.credits?.cast?.slice(0, 20).map(c => ({
        id: c.id,
        name: c.name,
        character: c.character,
        photo: img(c.profile_path, 'profile', 'medium')
      })) || [],
      crew: details.credits?.crew?.filter(c => 
        ['Director', 'Producer', 'Writer', 'Screenplay'].includes(c.job)
      ).slice(0, 10).map(c => ({
        id: c.id,
        name: c.name,
        job: c.job,
        photo: img(c.profile_path, 'profile', 'medium')
      })) || []
    }
  };
  
  return enriched;
}

async function processBatch(items) {
  const results = [];
  for (const item of items) {
    const enriched = await enrichItem(item);
    results.push(enriched);
    stats.processed++;
    printProgress();
  }
  return results;
}

function printProgress() {
  const elapsed = (Date.now() - stats.startTime) / 1000;
  const rate = stats.processed / elapsed;
  const eta = stats.total > 0 ? (stats.total - stats.processed) / rate / 60 : 0;
  
  process.stdout.write(`\r  ⚡ ${stats.processed}/${stats.total} | ${rate.toFixed(0)}/s | ETA: ${eta.toFixed(0)}min | ✅${stats.found} ❌${stats.notFound}`);
}

async function processCategory(categoryFile) {
  const filePath = path.join(DATA_DIR, `${categoryFile}.json`);
  const outputPath = path.join(OUTPUT_DIR, `${categoryFile}.json`);
  
  if (!fs.existsSync(filePath)) {
    console.log(`  ⚠️ ${categoryFile} não encontrado`);
    return;
  }
  
  console.log(`\n📁 ${categoryFile}`);
  
  const items = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const results = [];
  
  // Processa em batches
  for (let i = 0; i < items.length; i += PARALLEL_REQUESTS) {
    const batch = items.slice(i, i + PARALLEL_REQUESTS);
    const batchResults = await processBatch(batch);
    results.push(...batchResults);
    
    if (i + PARALLEL_REQUESTS < items.length) {
      await sleep(DELAY_BETWEEN_BATCHES);
    }
  }
  
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`\n  💾 Salvo: ${categoryFile}.json (${results.length} itens)`);
}

async function main() {
  console.log('🚀 Enriquecimento de Categorias Específicas\n');
  console.log(`⚡ ${PARALLEL_REQUESTS} requisições paralelas`);
  console.log(`⏱️ ${DELAY_BETWEEN_BATCHES}ms entre batches\n`);
  console.log(`📁 Categorias: ${CATEGORIES.join(', ')}\n`);
  
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  // Conta total
  for (const cat of CATEGORIES) {
    const filePath = path.join(DATA_DIR, `${cat}.json`);
    if (fs.existsSync(filePath)) {
      const items = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      stats.total += items.length;
    }
  }
  
  console.log(`📊 Total: ${stats.total} itens\n`);
  console.log('═'.repeat(60));
  
  stats.startTime = Date.now();
  
  for (const cat of CATEGORIES) {
    await processCategory(cat);
  }
  
  const totalTime = (Date.now() - stats.startTime) / 1000;
  
  console.log('\n' + '═'.repeat(60));
  console.log('📊 RESULTADO FINAL');
  console.log('═'.repeat(60));
  console.log(`✅ Encontrados: ${stats.found}`);
  console.log(`❌ Não encontrados: ${stats.notFound}`);
  console.log(`💾 Cache hits: ${stats.cached}`);
  console.log(`⚠️ Erros: ${stats.errors}`);
  console.log(`⏱️ Tempo: ${(totalTime / 60).toFixed(1)} minutos`);
  console.log(`⚡ Velocidade: ${(stats.processed / totalTime).toFixed(0)} itens/s`);
  console.log('═'.repeat(60));
}

main().catch(console.error);
