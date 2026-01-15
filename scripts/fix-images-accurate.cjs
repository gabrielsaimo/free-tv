/**
 * Script MELHORADO para corrigir imagens de séries e filmes
 * Considera: Nome + Ano + Tipo + Categoria para busca precisa
 * 
 * APIs utilizadas:
 * - TVMaze (séries) - gratuita, sem limite
 * - OMDb (filmes) - gratuita, com limite
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../public/data');
const OMDB_API_KEY = 'trilogy'; // Key pública para teste

// Estatísticas
let stats = {
  totalFiles: 0,
  processedSeries: 0,
  processedMovies: 0,
  updatedSeries: 0,
  updatedMovies: 0,
  errors: 0,
  skipped: 0
};

// Cache para evitar buscas duplicadas
const imageCache = new Map();

// Função para fazer requisição HTTP
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    protocol.get(url, { timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null))
      .on('timeout', () => resolve(null));
  });
}

// Extrair ano do nome
function extractYear(name) {
  // Padrão: "Nome (2023)"
  const match = name.match(/\((\d{4})\)/);
  if (match) return parseInt(match[1]);
  return null;
}

// Limpar nome para busca
function cleanSeriesName(name) {
  return name
    .replace(/\s*S\d+E\d+.*$/i, '')  // Remove S01E01...
    .replace(/\s*\(\d{4}\)\s*$/i, '') // Remove (2023)
    .trim();
}

function cleanMovieName(name) {
  return name
    .replace(/\s*\(\d{4}\)\s*$/i, '') // Remove (2023)
    .replace(/:\s*O Filme$/i, '')     // Remove ": O Filme"
    .trim();
}

// Detectar se é anime baseado na categoria
function isAnimeCategory(category) {
  const animeCategories = ['crunchyroll', 'funimation', 'animação', 'anime'];
  return animeCategories.some(cat => 
    category.toLowerCase().includes(cat.toLowerCase())
  );
}

// Detectar plataforma de streaming
function getStreamingPlatform(category) {
  const platforms = ['netflix', 'disney', 'hbo', 'max', 'prime', 'amazon', 'apple', 'paramount', 'globoplay'];
  const lowerCat = category.toLowerCase();
  
  for (const platform of platforms) {
    if (lowerCat.includes(platform)) {
      return platform;
    }
  }
  return null;
}

// ============================================
// BUSCA DE SÉRIES (TVMaze)
// ============================================
async function searchSeriesTVMaze(seriesName, year, category) {
  const cleanedName = cleanSeriesName(seriesName);
  const cacheKey = `series:${cleanedName}:${year || 'any'}:${category}`;
  
  if (imageCache.has(cacheKey)) {
    return imageCache.get(cacheKey);
  }
  
  const encodedName = encodeURIComponent(cleanedName);
  const url = `https://api.tvmaze.com/search/shows?q=${encodedName}`;
  
  const results = await fetchJSON(url);
  if (!results || results.length === 0) {
    imageCache.set(cacheKey, null);
    return null;
  }
  
  const isAnime = isAnimeCategory(category);
  const platform = getStreamingPlatform(category);
  
  let bestMatch = null;
  let bestScore = -Infinity;
  
  for (const result of results) {
    const show = result.show;
    if (!show.image) continue;
    
    let score = result.score * 10; // Base score
    
    // Extrair ano
    const showYear = show.premiered ? parseInt(show.premiered.split('-')[0]) : null;
    
    // Verificar se é anime
    const showIsAnime = show.type === 'Animation' || 
                        (show.genres && show.genres.includes('Anime'));
    
    // Verificar plataforma
    const showPlatform = (show.webChannel?.name || show.network?.name || '').toLowerCase();
    
    // ===== CRITÉRIOS DE PONTUAÇÃO =====
    
    // 1. Correspondência de ano (mais importante)
    if (year && showYear) {
      const yearDiff = Math.abs(year - showYear);
      if (yearDiff === 0) {
        score += 50; // Ano exato - MUITO importante
      } else if (yearDiff === 1) {
        score += 20; // Margem de 1 ano
      } else {
        score -= yearDiff * 10; // Penalizar anos diferentes
      }
    }
    
    // 2. Correspondência de tipo (anime vs live-action)
    if (isAnime && showIsAnime) {
      score += 30; // Anime esperado e encontrado
    } else if (!isAnime && !showIsAnime) {
      score += 30; // Live-action esperado e encontrado
    } else if (isAnime !== showIsAnime) {
      score -= 40; // PENALIZAR FORTEMENTE tipo incorreto
    }
    
    // 3. Correspondência de plataforma
    if (platform && showPlatform.includes(platform)) {
      score += 20;
    }
    
    // 4. Nome exato
    if (show.name.toLowerCase() === cleanedName.toLowerCase()) {
      score += 15;
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = show.image.medium || show.image.original;
    }
  }
  
  imageCache.set(cacheKey, bestMatch);
  return bestMatch;
}

// ============================================
// BUSCA DE FILMES (OMDb)
// ============================================
async function searchMovieOMDb(movieName, year) {
  const cleanedName = cleanMovieName(movieName);
  const cacheKey = `movie:${cleanedName}:${year || 'any'}`;
  
  if (imageCache.has(cacheKey)) {
    return imageCache.get(cacheKey);
  }
  
  // Construir URL com ou sem ano
  let url = `https://www.omdbapi.com/?apikey=${OMDB_API_KEY}&s=${encodeURIComponent(cleanedName)}&type=movie`;
  if (year) {
    url += `&y=${year}`;
  }
  
  const result = await fetchJSON(url);
  
  if (!result || result.Response === 'False' || !result.Search) {
    // Tentar sem filtro de ano se não encontrou
    if (year) {
      const urlNoYear = `https://www.omdbapi.com/?apikey=${OMDB_API_KEY}&s=${encodeURIComponent(cleanedName)}&type=movie`;
      const result2 = await fetchJSON(urlNoYear);
      
      if (result2 && result2.Response === 'True' && result2.Search) {
        // Encontrar o mais próximo do ano
        let bestMatch = null;
        let bestYearDiff = Infinity;
        
        for (const movie of result2.Search) {
          if (!movie.Poster || movie.Poster === 'N/A') continue;
          
          const movieYear = parseInt(movie.Year) || 0;
          const yearDiff = year ? Math.abs(year - movieYear) : 0;
          
          if (yearDiff < bestYearDiff) {
            bestYearDiff = yearDiff;
            bestMatch = movie.Poster.replace('_SX300', '_SX500'); // Imagem maior
          }
        }
        
        imageCache.set(cacheKey, bestMatch);
        return bestMatch;
      }
    }
    
    imageCache.set(cacheKey, null);
    return null;
  }
  
  // Pegar o primeiro resultado com poster válido
  for (const movie of result.Search) {
    if (movie.Poster && movie.Poster !== 'N/A') {
      const image = movie.Poster.replace('_SX300', '_SX500');
      imageCache.set(cacheKey, image);
      return image;
    }
  }
  
  imageCache.set(cacheKey, null);
  return null;
}

// ============================================
// PROCESSAMENTO DE ARQUIVOS
// ============================================

// Agrupar séries por nome base
function groupSeries(items) {
  const groups = new Map();
  
  for (const item of items) {
    if (item.type !== 'series') continue;
    
    const baseName = cleanSeriesName(item.name);
    const year = extractYear(item.name);
    const key = `${baseName}|${year || 'noYear'}|${item.category}`;
    
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

// Processar um arquivo
async function processFile(filename) {
  const filePath = path.join(DATA_DIR, filename);
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const items = JSON.parse(content);
    
    if (!Array.isArray(items)) return;
    
    let modified = false;
    
    // ===== PROCESSAR SÉRIES =====
    const seriesGroups = groupSeries(items);
    
    for (const [key, group] of seriesGroups) {
      stats.processedSeries++;
      
      const newImage = await searchSeriesTVMaze(group.baseName, group.year, group.category);
      
      if (newImage) {
        for (const episode of group.episodes) {
          if (episode.logo !== newImage) {
            episode.logo = newImage;
            modified = true;
          }
        }
        stats.updatedSeries++;
        process.stdout.write(`\r✅ Séries: ${stats.updatedSeries} | Filmes: ${stats.updatedMovies}`);
      }
    }
    
    // ===== PROCESSAR FILMES =====
    for (const item of items) {
      if (item.type !== 'movie') continue;
      
      stats.processedMovies++;
      
      const year = extractYear(item.name);
      const newImage = await searchMovieOMDb(item.name, year);
      
      if (newImage && item.logo !== newImage) {
        item.logo = newImage;
        modified = true;
        stats.updatedMovies++;
        process.stdout.write(`\r✅ Séries: ${stats.updatedSeries} | Filmes: ${stats.updatedMovies}`);
      }
    }
    
    // Salvar se modificado
    if (modified) {
      fs.writeFileSync(filePath, JSON.stringify(items, null, 2), 'utf8');
    }
    
  } catch (error) {
    stats.errors++;
    console.error(`\n❌ Erro em ${filename}: ${error.message}`);
  }
}

// Função principal
async function main() {
  console.log('='.repeat(60));
  console.log('🎬 CORREÇÃO PRECISA DE IMAGENS (Nome + Ano + Tipo)');
  console.log('='.repeat(60));
  console.log('');
  console.log('APIs: TVMaze (séries) + OMDb (filmes)');
  console.log('Critérios: Nome + Ano + Tipo (anime/live-action) + Plataforma');
  console.log('');
  
  const files = fs.readdirSync(DATA_DIR)
    .filter(f => f.endsWith('.json'))
    .filter(f => f !== 'categories.json');
  
  console.log(`📁 Arquivos encontrados: ${files.length}`);
  console.log('');
  
  stats.totalFiles = files.length;
  
  for (const file of files) {
    console.log(`\n📂 Processando: ${file}`);
    await processFile(file);
  }
  
  console.log('\n');
  console.log('='.repeat(60));
  console.log('📊 RELATÓRIO FINAL');
  console.log('='.repeat(60));
  console.log(`Arquivos processados: ${stats.totalFiles}`);
  console.log(`Séries processadas: ${stats.processedSeries}`);
  console.log(`Séries atualizadas: ${stats.updatedSeries}`);
  console.log(`Filmes processados: ${stats.processedMovies}`);
  console.log(`Filmes atualizados: ${stats.updatedMovies}`);
  console.log(`Erros: ${stats.errors}`);
}

main().catch(console.error);
