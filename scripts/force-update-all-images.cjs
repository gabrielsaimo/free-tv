/**
 * Script para FORÇAR atualização de TODAS as imagens para posters do TMDB
 * 
 * Este script:
 * 1. Lê todos os arquivos JSON da pasta public/data
 * 2. Para CADA filme/série, busca no TMDB (mesmo se já tiver imagem)
 * 3. Atualiza o campo 'logo' com a URL do poster do TMDB
 * 4. Salva os arquivos atualizados
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Configurações do TMDB
const TMDB_API_KEY = '15d2ea6d0dc1d476efbca3eba2b9bbfb';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w780';
const DATA_DIR = path.join(__dirname, '..', 'public', 'data');

// Rate limiting - TMDB permite ~40 requisições por 10 segundos
const DELAY_BETWEEN_REQUESTS = 250; // 250ms entre requisições

// Cache para séries (evita buscas repetidas de episódios da mesma série)
const seriesCache = new Map();

// Estatísticas
let stats = {
  total: 0,
  updated: 0,
  notFound: 0,
  cached: 0,
  errors: 0
};

/**
 * Faz uma requisição HTTPS e retorna uma Promise
 */
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout')), 10000);
    
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        clearTimeout(timeout);
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Erro ao parsear JSON'));
        }
      });
    }).on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

/**
 * Aguarda um tempo em ms
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Limpa o título para busca
 */
function cleanTitle(title) {
  if (!title) return '';
  
  return title
    // Remove ano entre parênteses
    .replace(/\s*\(\d{4}\)\s*$/, '')
    // Remove indicador de episódio
    .replace(/\s*S\d+E\d+.*$/i, '')
    .replace(/\s*EP?\d+.*$/i, '')
    .replace(/\s*-\s*Episódio\s*\d+.*$/i, '')
    .replace(/\s*Temporada\s*\d+.*$/i, '')
    // Remove caracteres especiais
    .replace(/[™®©]/g, '')
    // Normaliza espaços
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Verifica se é um episódio de série
 */
function isEpisode(name) {
  return /S\d+E\d+|EP?\d+|\bEpisódio\s*\d+/i.test(name);
}

/**
 * Extrai o ano do nome do item
 */
function extractYear(name) {
  const match = name.match(/\((\d{4})\)/);
  return match ? parseInt(match[1]) : null;
}

/**
 * Normaliza string para comparação
 */
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

/**
 * Encontra a melhor correspondência entre os resultados do TMDB
 */
function findBestMatch(results, originalTitle, year) {
  if (!results || results.length === 0) return null;

  const normalizedOriginal = normalizeForComparison(originalTitle);
  
  // Primeiro, busca correspondência exata com ano
  for (const result of results) {
    const tmdbTitle = result.title || result.name || '';
    const normalizedTmdb = normalizeForComparison(tmdbTitle);
    const tmdbYear = result.release_date?.split('-')[0] || result.first_air_date?.split('-')[0];
    
    if (normalizedTmdb === normalizedOriginal && (!year || tmdbYear === String(year))) {
      return result;
    }
  }
  
  // Segundo, busca correspondência exata sem verificar ano
  for (const result of results) {
    const tmdbTitle = result.title || result.name || '';
    const normalizedTmdb = normalizeForComparison(tmdbTitle);
    
    if (normalizedTmdb === normalizedOriginal) {
      return result;
    }
  }
  
  // Terceiro, busca se o título está contido
  for (const result of results) {
    const tmdbTitle = result.title || result.name || '';
    const normalizedTmdb = normalizeForComparison(tmdbTitle);
    
    if (normalizedTmdb.includes(normalizedOriginal) || normalizedOriginal.includes(normalizedTmdb)) {
      const tmdbYear = result.release_date?.split('-')[0] || result.first_air_date?.split('-')[0];
      if (!year || tmdbYear === String(year)) {
        return result;
      }
    }
  }
  
  // Quarto, retorna o primeiro resultado que tem poster
  for (const result of results) {
    if (result.poster_path) {
      return result;
    }
  }
  
  return results[0];
}

/**
 * Busca imagem do TMDB para um item
 */
async function searchTMDBImage(name, type) {
  const cleanedTitle = cleanTitle(name);
  const year = extractYear(name);
  
  // Verifica cache para episódios
  const cacheKey = cleanedTitle.toLowerCase();
  if (isEpisode(name) && seriesCache.has(cacheKey)) {
    stats.cached++;
    return seriesCache.get(cacheKey);
  }
  
  // Se for episódio, busca como série TV
  const itemIsEpisode = isEpisode(name);
  const searchType = itemIsEpisode || type === 'series' ? 'tv' : 'movie';
  const yearParam = year && searchType === 'movie' ? `&year=${year}` : '';
  
  const searchUrl = `https://api.themoviedb.org/3/search/${searchType}?api_key=${TMDB_API_KEY}&language=pt-BR&query=${encodeURIComponent(cleanedTitle)}${yearParam}`;
  
  try {
    const data = await fetchJSON(searchUrl);
    
    if (data.results && data.results.length > 0) {
      const bestMatch = findBestMatch(data.results, cleanedTitle, year);
      
      if (bestMatch && bestMatch.poster_path) {
        const imageUrl = `${TMDB_IMAGE_BASE}${bestMatch.poster_path}`;
        
        // Salva no cache se for episódio
        if (itemIsEpisode) {
          seriesCache.set(cacheKey, imageUrl);
        }
        
        return imageUrl;
      }
    }
    
    // Tenta buscar como filme se não encontrou como série
    if (searchType === 'tv') {
      const movieUrl = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&language=pt-BR&query=${encodeURIComponent(cleanedTitle)}`;
      const movieData = await fetchJSON(movieUrl);
      
      if (movieData.results && movieData.results.length > 0) {
        const bestMatch = findBestMatch(movieData.results, cleanedTitle, year);
        
        if (bestMatch && bestMatch.poster_path) {
          const imageUrl = `${TMDB_IMAGE_BASE}${bestMatch.poster_path}`;
          
          if (itemIsEpisode) {
            seriesCache.set(cacheKey, imageUrl);
          }
          
          return imageUrl;
        }
      }
    }
    
    // Se é filme, tenta como série também
    if (searchType === 'movie') {
      const tvUrl = `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&language=pt-BR&query=${encodeURIComponent(cleanedTitle)}`;
      const tvData = await fetchJSON(tvUrl);
      
      if (tvData.results && tvData.results.length > 0) {
        const bestMatch = findBestMatch(tvData.results, cleanedTitle, year);
        
        if (bestMatch && bestMatch.poster_path) {
          return `${TMDB_IMAGE_BASE}${bestMatch.poster_path}`;
        }
      }
    }
    
    // Salva null no cache para episódios não encontrados
    if (itemIsEpisode) {
      seriesCache.set(cacheKey, null);
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Processa um arquivo JSON
 */
async function processFile(filePath) {
  const fileName = path.basename(filePath);
  console.log(`\n📁 Processando: ${fileName}`);
  
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const items = JSON.parse(content);
    
    if (!Array.isArray(items)) {
      console.log(`  ⚠️ Arquivo não é um array, pulando...`);
      return;
    }
    
    let fileUpdated = false;
    let fileStats = { total: 0, updated: 0, notFound: 0, cached: 0 };
    
    console.log(`  📊 Total de itens: ${items.length}`);
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      stats.total++;
      fileStats.total++;
      
      // Mostra progresso a cada 100 itens
      if ((i + 1) % 100 === 0 || i === 0) {
        process.stdout.write(`\r  🔄 Processando: ${i + 1}/${items.length} (${Math.round((i + 1) / items.length * 100)}%)`);
      }
      
      // Busca nova imagem no TMDB
      const cachedBefore = stats.cached;
      const newImageUrl = await searchTMDBImage(item.name, item.type);
      
      if (stats.cached > cachedBefore) {
        fileStats.cached++;
      }
      
      if (newImageUrl) {
        if (item.logo !== newImageUrl) {
          item.logo = newImageUrl;
          fileUpdated = true;
        }
        stats.updated++;
        fileStats.updated++;
      } else {
        stats.notFound++;
        fileStats.notFound++;
      }
      
      // Aguarda para não sobrecarregar a API (só se não veio do cache)
      if (stats.cached === cachedBefore) {
        await sleep(DELAY_BETWEEN_REQUESTS);
      }
    }
    
    console.log(''); // Nova linha após progresso
    
    // Salva o arquivo se houve atualizações
    if (fileUpdated) {
      fs.writeFileSync(filePath, JSON.stringify(items, null, 2), 'utf-8');
      console.log(`  💾 Arquivo salvo!`);
    } else {
      console.log(`  ℹ️ Nenhuma alteração necessária`);
    }
    
    console.log(`  📊 Resultado: ${fileStats.updated} atualizados | ${fileStats.cached} do cache | ${fileStats.notFound} não encontrados`);
    
  } catch (error) {
    console.error(`  ❌ Erro ao processar ${fileName}: ${error.message}`);
    stats.errors++;
  }
}

/**
 * Função principal
 */
async function main() {
  console.log('🎬 FORÇAR ATUALIZAÇÃO DE TODAS AS IMAGENS PARA TMDB');
  console.log('====================================================\n');
  
  // Lista todos os arquivos JSON
  const files = fs.readdirSync(DATA_DIR)
    .filter(file => file.endsWith('.json') && file !== 'categories.json')
    .map(file => path.join(DATA_DIR, file));
  
  console.log(`📂 Encontrados ${files.length} arquivos JSON para processar\n`);
  
  // Ordena arquivos por tamanho (menores primeiro para testes rápidos)
  const sortedFiles = files.sort((a, b) => {
    const sizeA = fs.statSync(a).size;
    const sizeB = fs.statSync(b).size;
    return sizeA - sizeB;
  });
  
  const startTime = Date.now();
  
  // Processa cada arquivo
  for (const file of sortedFiles) {
    await processFile(file);
  }
  
  const endTime = Date.now();
  const duration = Math.round((endTime - startTime) / 1000);
  
  // Mostra estatísticas finais
  console.log('\n====================================================');
  console.log('📊 ESTATÍSTICAS FINAIS');
  console.log('====================================================');
  console.log(`Total de itens processados: ${stats.total}`);
  console.log(`Imagens atualizadas: ${stats.updated}`);
  console.log(`Buscas do cache: ${stats.cached}`);
  console.log(`Não encontrados: ${stats.notFound}`);
  console.log(`Erros: ${stats.errors}`);
  console.log(`Tempo total: ${Math.floor(duration / 60)}m ${duration % 60}s`);
  console.log('====================================================\n');
}

// Executa o script
main().catch(console.error);
