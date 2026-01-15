/**
 * Script para testar a precisão das imagens usando nome + ano + tipo
 * Testa busca melhorada no TVMaze considerando:
 * - Nome da série/filme
 * - Ano de lançamento (extraído do nome)
 * - Tipo (series/movie)
 * - Categoria (netflix, crunchyroll, etc)
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Exemplos para testar
const testCases = [
  // One Piece - casos conflitantes
  { name: "One Piece S01E01", type: "series", category: "📺 Netflix", expected: "Live-action 2023" },
  { name: "One Piece: Red (2022)", type: "movie", category: "🎬 Animação", expected: "Filme anime 2022" },
  { name: "One Piece Gold: O Filme (2016)", type: "movie", category: "🎬 Legendados", expected: "Filme anime 2016" },
  
  // Outros exemplos potencialmente problemáticos
  { name: "Dune (2021)", type: "movie", category: "🎬 Cinema", expected: "Filme 2021" },
  { name: "Dune (1984)", type: "movie", category: "🎬 Cinema", expected: "Filme 1984" },
  
  // Avatar
  { name: "Avatar (2009)", type: "movie", category: "🎬 Cinema", expected: "Filme Avatar James Cameron" },
  { name: "Avatar: The Last Airbender S01E01", type: "series", category: "📺 Netflix", expected: "Série Live-action 2024" },
  
  // Batman - vários filmes com mesmo nome
  { name: "Batman (1989)", type: "movie", category: "🎬 Cinema", expected: "Tim Burton Batman" },
  { name: "Batman (2022)", type: "movie", category: "🎬 Cinema", expected: "The Batman Robert Pattinson" },
];

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
  // Padrão: "Nome (2023)" ou "Nome 2023"
  const match = name.match(/\((\d{4})\)/);
  if (match) return parseInt(match[1]);
  
  // Também tentar formato sem parênteses no final
  const match2 = name.match(/(\d{4})$/);
  if (match2) return parseInt(match2[1]);
  
  return null;
}

// Limpar nome para busca
function cleanName(name) {
  return name
    .replace(/\s*S\d+E\d+.*$/i, '')  // Remove S01E01...
    .replace(/\s*\(\d{4}\)\s*$/i, '') // Remove (2023)
    .replace(/\s*\d{4}\s*$/i, '')     // Remove 2023 no final
    .replace(/:\s*O Filme$/i, '')     // Remove ": O Filme"
    .replace(/[:\-–]\s*(Red|Gold|Stampede|Z).*$/i, '') // Remove subtítulos de filmes
    .trim();
}

// Detectar se é anime baseado na categoria
function isAnime(category, name) {
  const animeCategories = ['Crunchyroll', 'Funimation', 'Animação', 'Anime'];
  const animeInCategory = animeCategories.some(cat => 
    category.toLowerCase().includes(cat.toLowerCase())
  );
  
  // Também verificar se o nome tem padrões de anime
  const animePatterns = ['One Piece', 'Naruto', 'Dragon Ball', 'Attack on Titan', 'Demon Slayer'];
  const isKnownAnime = animePatterns.some(pattern => 
    name.toLowerCase().includes(pattern.toLowerCase())
  );
  
  return animeInCategory;
}

// Buscar série no TVMaze com filtro por ano
async function searchTVMaze(seriesName, year, category, type) {
  const cleanedName = cleanName(seriesName);
  console.log(`  🔍 Buscando: "${cleanedName}" (ano: ${year || 'N/A'}, tipo: ${type})`);
  
  const encodedName = encodeURIComponent(cleanedName);
  const url = `https://api.tvmaze.com/search/shows?q=${encodedName}`;
  
  const results = await fetchJSON(url);
  if (!results || results.length === 0) {
    return null;
  }
  
  // Filtrar e ordenar resultados
  let bestMatch = null;
  let bestScore = -1;
  
  const isAnimeContent = isAnime(category, seriesName);
  
  for (const result of results) {
    const show = result.show;
    if (!show.image) continue;
    
    let score = result.score;
    
    // Extrair ano do premiered
    const showYear = show.premiered ? parseInt(show.premiered.split('-')[0]) : null;
    
    // Verificar se é anime
    const showIsAnime = show.type === 'Animation' || 
                        (show.genres && show.genres.includes('Anime'));
    
    // Verificar se é da Netflix
    const showIsNetflix = show.webChannel?.name === 'Netflix' || 
                          show.network?.name === 'Netflix';
    
    // Ajustar score baseado em critérios
    
    // 1. Correspondência de ano
    if (year && showYear) {
      const yearDiff = Math.abs(year - showYear);
      if (yearDiff === 0) {
        score += 5; // Ano exato
        console.log(`    ✓ Ano exato: ${showYear}`);
      } else if (yearDiff <= 1) {
        score += 2; // Diferença de 1 ano (margem)
      } else {
        score -= yearDiff; // Penalizar anos diferentes
      }
    }
    
    // 2. Correspondência de tipo (anime vs live-action)
    if (isAnimeContent && showIsAnime) {
      score += 3;
      console.log(`    ✓ Tipo anime corresponde`);
    } else if (!isAnimeContent && !showIsAnime) {
      score += 3;
      console.log(`    ✓ Tipo live-action corresponde`);
    } else if (isAnimeContent !== showIsAnime) {
      score -= 5; // Penalizar tipo incorreto
      console.log(`    ✗ Tipo não corresponde (anime: ${showIsAnime}, esperado anime: ${isAnimeContent})`);
    }
    
    // 3. Correspondência de plataforma
    if (category.includes('Netflix') && showIsNetflix) {
      score += 2;
      console.log(`    ✓ Plataforma Netflix corresponde`);
    }
    
    // 4. Nome exato
    if (show.name.toLowerCase() === cleanedName.toLowerCase()) {
      score += 3;
    }
    
    console.log(`    → "${show.name}" (${showYear}) - Score: ${score.toFixed(2)}, Anime: ${showIsAnime}`);
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = {
        name: show.name,
        year: showYear,
        image: show.image.medium || show.image.original,
        isAnime: showIsAnime,
        score: score
      };
    }
  }
  
  return bestMatch;
}

// Buscar filme no TMDB (para filmes)
async function searchTMDBMovie(movieName, year) {
  // TMDB API - precisamos de uma chave válida
  // Por agora, vamos usar TheMovieDB diretamente
  const cleanedName = cleanName(movieName);
  const yearParam = year ? `&year=${year}` : '';
  
  // Usando API alternativa que não precisa de chave
  const url = `https://api.themoviedb.org/3/search/movie?api_key=6a9cd46770a9adee6ee6bb7e69154aaa&query=${encodeURIComponent(cleanedName)}${yearParam}`;
  
  const result = await fetchJSON(url);
  if (!result || !result.results || result.results.length === 0) {
    return null;
  }
  
  // Encontrar o filme com ano mais próximo
  let bestMatch = null;
  let bestScore = -1;
  
  for (const movie of result.results) {
    if (!movie.poster_path) continue;
    
    let score = movie.popularity || 0;
    const movieYear = movie.release_date ? parseInt(movie.release_date.split('-')[0]) : null;
    
    if (year && movieYear) {
      const yearDiff = Math.abs(year - movieYear);
      if (yearDiff === 0) {
        score += 100; // Ano exato
      } else if (yearDiff <= 1) {
        score += 50; // Margem de 1 ano
      } else {
        score -= yearDiff * 10; // Penalizar
      }
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = {
        name: movie.title,
        year: movieYear,
        image: `https://image.tmdb.org/t/p/w500${movie.poster_path}`,
        score: score
      };
    }
  }
  
  return bestMatch;
}

// Função principal de teste
async function testImageSearch() {
  console.log('='.repeat(80));
  console.log('🧪 TESTE DE PRECISÃO DE IMAGENS');
  console.log('='.repeat(80));
  console.log('');
  
  for (const testCase of testCases) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`📌 ${testCase.name}`);
    console.log(`   Tipo: ${testCase.type}, Categoria: ${testCase.category}`);
    console.log(`   Esperado: ${testCase.expected}`);
    console.log('');
    
    const year = extractYear(testCase.name);
    
    if (testCase.type === 'series') {
      const result = await searchTVMaze(testCase.name, year, testCase.category, testCase.type);
      
      if (result) {
        console.log(`\n   ✅ RESULTADO:`);
        console.log(`      Nome: ${result.name}`);
        console.log(`      Ano: ${result.year}`);
        console.log(`      Anime: ${result.isAnime}`);
        console.log(`      Score: ${result.score.toFixed(2)}`);
        console.log(`      Imagem: ${result.image}`);
      } else {
        console.log(`\n   ❌ Nenhum resultado encontrado`);
      }
    } else {
      const result = await searchTMDBMovie(testCase.name, year);
      
      if (result) {
        console.log(`\n   ✅ RESULTADO:`);
        console.log(`      Nome: ${result.name}`);
        console.log(`      Ano: ${result.year}`);
        console.log(`      Score: ${result.score.toFixed(2)}`);
        console.log(`      Imagem: ${result.image}`);
      } else {
        console.log(`\n   ❌ Nenhum resultado encontrado`);
      }
    }
    
    // Delay para não sobrecarregar as APIs
    await new Promise(r => setTimeout(r, 500));
  }
  
  console.log(`\n${'='.repeat(80)}`);
  console.log('Teste concluído!');
}

// Executar
testImageSearch().catch(console.error);
