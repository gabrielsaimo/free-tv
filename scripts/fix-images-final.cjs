/**
 * Script FINAL para corrigir imagens com precisão
 * 
 * MELHORIAS:
 * 1. Remove [4K], [HDR], etc. do nome
 * 2. Usa o ANO extraído do nome para filtrar resultados
 * 3. Considera tipo (anime vs live-action) para séries
 * 4. Usa TVMaze para séries e OMDb para filmes
 * 5. Cache para evitar buscas duplicadas
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../public/data');
const OMDB_API_KEY = 'trilogy';

// Estatísticas
let stats = {
  totalFiles: 0,
  processedSeries: 0,
  processedMovies: 0,
  updatedSeries: 0,
  updatedMovies: 0,
  notFound: 0,
  errors: 0
};

// Cache
const imageCache = new Map();

// HTTP fetch
function fetchJSON(url) {
  return new Promise((resolve) => {
    https.get(url, { timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(null); }
      });
    }).on('error', () => resolve(null))
      .on('timeout', () => resolve(null));
  });
}

// Extrair ano do nome
function extractYear(name) {
  const match = name.match(/\((\d{4})\)/);
  return match ? parseInt(match[1]) : null;
}

// Limpar nome para busca
function cleanName(name) {
  return name
    // Remove episódio (S01E01, S01 E01, etc.)
    .replace(/\s*S\d+\s*E\s*\d+.*$/i, '')
    // Remove ano
    .replace(/\s*\(\d{4}\)\s*/g, ' ')
    // Remove qualidade [4K], [HDR], [IMAX], etc.
    .replace(/\s*\[.*?\]\s*/g, ' ')
    // Remove ": O Filme" e variações
    .replace(/:\s*(O\s+)?Filme$/i, '')
    // Remove "- Parte X"
    .replace(/\s*-\s*Parte\s+\d+$/i, '')
    // Remove múltiplos espaços
    .replace(/\s+/g, ' ')
    .trim();
}

// Detectar se categoria é de anime
function isAnimeCategory(category) {
  const anime = ['crunchyroll', 'funimation', 'animação', 'anime'];
  return anime.some(a => category.toLowerCase().includes(a));
}

// ============================================
// BUSCA DE SÉRIES (TVMaze)
// ============================================
async function searchSeries(name, year, category) {
  const cleanedName = cleanName(name);
  const cacheKey = `s:${cleanedName}:${year}:${category}`;
  
  if (imageCache.has(cacheKey)) return imageCache.get(cacheKey);
  
  const url = `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(cleanedName)}`;
  const results = await fetchJSON(url);
  
  if (!results || !results.length) {
    imageCache.set(cacheKey, null);
    return null;
  }
  
  const expectAnime = isAnimeCategory(category);
  let best = null, bestScore = -Infinity;
  
  for (const r of results) {
    const show = r.show;
    if (!show.image) continue;
    
    let score = r.score * 10;
    
    // Ano
    const showYear = show.premiered ? parseInt(show.premiered.split('-')[0]) : null;
    if (year && showYear) {
      const diff = Math.abs(year - showYear);
      if (diff === 0) score += 50;
      else if (diff === 1) score += 20;
      else score -= diff * 10;
    }
    
    // Tipo
    const isAnime = show.type === 'Animation' || (show.genres || []).includes('Anime');
    if (expectAnime === isAnime) score += 30;
    else score -= 40;
    
    // Nome exato
    if (show.name.toLowerCase() === cleanedName.toLowerCase()) score += 15;
    
    if (score > bestScore) {
      bestScore = score;
      best = show.image.original || show.image.medium;
    }
  }
  
  imageCache.set(cacheKey, best);
  return best;
}

// ============================================
// BUSCA DE FILMES (OMDb)
// ============================================
async function searchMovie(name, year) {
  const cleanedName = cleanName(name);
  const cacheKey = `m:${cleanedName}:${year}`;
  
  if (imageCache.has(cacheKey)) return imageCache.get(cacheKey);
  
  // Primeiro, tentar com ano
  let url = `https://www.omdbapi.com/?apikey=${OMDB_API_KEY}&s=${encodeURIComponent(cleanedName)}&type=movie`;
  if (year) url += `&y=${year}`;
  
  let result = await fetchJSON(url);
  
  // Se não encontrou, tentar sem ano
  if (!result || result.Response === 'False') {
    url = `https://www.omdbapi.com/?apikey=${OMDB_API_KEY}&s=${encodeURIComponent(cleanedName)}&type=movie`;
    result = await fetchJSON(url);
  }
  
  if (!result || result.Response === 'False' || !result.Search) {
    imageCache.set(cacheKey, null);
    return null;
  }
  
  // Encontrar melhor match por ano
  let best = null, bestDiff = Infinity;
  
  for (const m of result.Search) {
    if (!m.Poster || m.Poster === 'N/A') continue;
    
    const movieYear = parseInt(m.Year) || 0;
    const diff = year ? Math.abs(year - movieYear) : 0;
    
    if (diff < bestDiff || (diff === bestDiff && !best)) {
      bestDiff = diff;
      // Melhorar qualidade da imagem
      best = m.Poster.replace('_SX300', '_SX500');
    }
  }
  
  imageCache.set(cacheKey, best);
  return best;
}

// ============================================
// PROCESSAR ARQUIVOS
// ============================================

// Agrupar séries
function groupSeries(items) {
  const groups = new Map();
  
  for (const item of items) {
    if (item.type !== 'series') continue;
    
    const baseName = cleanName(item.name);
    const year = extractYear(item.name);
    const key = `${baseName}|${year || 'N'}|${item.category}`;
    
    if (!groups.has(key)) {
      groups.set(key, {
        baseName,
        year,
        category: item.category,
        episodes: []
      });
    }
    groups.get(key).episodes.push(item);
  }
  
  return groups;
}

// Processar arquivo
async function processFile(filename) {
  const filePath = path.join(DATA_DIR, filename);
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const items = JSON.parse(content);
    
    if (!Array.isArray(items)) return;
    
    let modified = false;
    
    // SÉRIES
    const groups = groupSeries(items);
    for (const [key, group] of groups) {
      stats.processedSeries++;
      
      const img = await searchSeries(group.baseName, group.year, group.category);
      
      if (img) {
        for (const ep of group.episodes) {
          if (ep.logo !== img) {
            ep.logo = img;
            modified = true;
          }
        }
        stats.updatedSeries++;
      } else {
        stats.notFound++;
      }
      
      process.stdout.write(`\r📊 Séries: ${stats.updatedSeries}/${stats.processedSeries} | Filmes: ${stats.updatedMovies}/${stats.processedMovies} | Não encontrados: ${stats.notFound}   `);
    }
    
    // FILMES
    for (const item of items) {
      if (item.type !== 'movie') continue;
      
      stats.processedMovies++;
      
      const year = extractYear(item.name);
      const img = await searchMovie(item.name, year);
      
      if (img && item.logo !== img) {
        item.logo = img;
        modified = true;
        stats.updatedMovies++;
      } else if (!img) {
        stats.notFound++;
      }
      
      process.stdout.write(`\r📊 Séries: ${stats.updatedSeries}/${stats.processedSeries} | Filmes: ${stats.updatedMovies}/${stats.processedMovies} | Não encontrados: ${stats.notFound}   `);
    }
    
    // Salvar
    if (modified) {
      fs.writeFileSync(filePath, JSON.stringify(items, null, 2), 'utf8');
    }
    
  } catch (err) {
    stats.errors++;
    console.error(`\n❌ Erro em ${filename}: ${err.message}`);
  }
}

// Main
async function main() {
  console.log('═'.repeat(70));
  console.log('🎬 CORREÇÃO DE IMAGENS COM PRECISÃO (Nome + Ano + Tipo)');
  console.log('═'.repeat(70));
  console.log('');
  console.log('📋 Critérios de busca:');
  console.log('   • Nome limpo (sem [4K], episódio, etc.)');
  console.log('   • Ano extraído do nome');
  console.log('   • Tipo: anime vs live-action (para séries)');
  console.log('');
  console.log('🌐 APIs: TVMaze (séries) + OMDb (filmes)');
  console.log('');
  
  const files = fs.readdirSync(DATA_DIR)
    .filter(f => f.endsWith('.json'))
    .filter(f => f !== 'categories.json');
  
  stats.totalFiles = files.length;
  console.log(`📁 ${files.length} arquivos para processar`);
  console.log('');
  
  for (let i = 0; i < files.length; i++) {
    console.log(`\n📂 [${i+1}/${files.length}] ${files[i]}`);
    await processFile(files[i]);
  }
  
  console.log('\n\n');
  console.log('═'.repeat(70));
  console.log('📊 RELATÓRIO FINAL');
  console.log('═'.repeat(70));
  console.log(`Arquivos processados:  ${stats.totalFiles}`);
  console.log(`Séries processadas:    ${stats.processedSeries}`);
  console.log(`Séries atualizadas:    ${stats.updatedSeries}`);
  console.log(`Filmes processados:    ${stats.processedMovies}`);
  console.log(`Filmes atualizados:    ${stats.updatedMovies}`);
  console.log(`Não encontrados:       ${stats.notFound}`);
  console.log(`Erros:                 ${stats.errors}`);
  console.log('═'.repeat(70));
}

main().catch(console.error);
