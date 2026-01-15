/**
 * Script de TESTE focado para verificar precisão da busca
 * Testa casos específicos antes de aplicar em massa
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../public/data');

// Função para fazer requisição HTTP
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

// Extrair ano do nome
function extractYear(name) {
  const match = name.match(/\((\d{4})\)/);
  if (match) return parseInt(match[1]);
  return null;
}

// Limpar nome
function cleanName(name) {
  return name
    .replace(/\s*S\d+E\d+.*$/i, '')
    .replace(/\s*\(\d{4}\)\s*$/i, '')
    .replace(/:\s*O Filme$/i, '')
    .trim();
}

// Detectar anime
function isAnimeCategory(category) {
  const animeCategories = ['crunchyroll', 'funimation', 'animação', 'anime'];
  return animeCategories.some(cat => category.toLowerCase().includes(cat));
}

// Buscar série TVMaze com scoring inteligente
async function searchSeriesTVMaze(name, year, category) {
  const cleanedName = cleanName(name);
  const url = `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(cleanedName)}`;
  
  console.log(`    🔍 Buscando: "${cleanedName}" (ano: ${year || 'N/A'})`);
  
  const results = await fetchJSON(url);
  if (!results || results.length === 0) return null;
  
  const isAnime = isAnimeCategory(category);
  let bestMatch = null;
  let bestScore = -Infinity;
  
  console.log(`    📋 ${results.length} resultados encontrados:`);
  
  for (const result of results) {
    const show = result.show;
    if (!show.image) continue;
    
    const showYear = show.premiered ? parseInt(show.premiered.split('-')[0]) : null;
    const showIsAnime = show.type === 'Animation' || (show.genres || []).includes('Anime');
    
    let score = result.score * 10;
    let reasons = [];
    
    // Ano
    if (year && showYear) {
      const yearDiff = Math.abs(year - showYear);
      if (yearDiff === 0) {
        score += 50;
        reasons.push(`+50 ano exato`);
      } else if (yearDiff === 1) {
        score += 20;
        reasons.push(`+20 ano próximo`);
      } else {
        score -= yearDiff * 10;
        reasons.push(`-${yearDiff * 10} ano diferente`);
      }
    }
    
    // Tipo
    if (isAnime === showIsAnime) {
      score += 30;
      reasons.push(`+30 tipo correto`);
    } else {
      score -= 40;
      reasons.push(`-40 tipo ERRADO`);
    }
    
    console.log(`       → "${show.name}" (${showYear}, ${showIsAnime ? 'anime' : 'live'}) = ${score.toFixed(1)} [${reasons.join(', ')}]`);
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = {
        name: show.name,
        year: showYear,
        image: show.image.medium,
        isAnime: showIsAnime,
        score: score
      };
    }
  }
  
  return bestMatch;
}

// Buscar filme OMDb
async function searchMovieOMDb(name, year) {
  const cleanedName = cleanName(name);
  let url = `https://www.omdbapi.com/?apikey=trilogy&s=${encodeURIComponent(cleanedName)}&type=movie`;
  if (year) url += `&y=${year}`;
  
  console.log(`    🔍 Buscando: "${cleanedName}" (ano: ${year || 'N/A'})`);
  
  const result = await fetchJSON(url);
  if (!result || result.Response === 'False' || !result.Search) {
    console.log(`    ❌ Não encontrado com ano ${year}, tentando sem...`);
    
    // Tentar sem ano
    const url2 = `https://www.omdbapi.com/?apikey=trilogy&s=${encodeURIComponent(cleanedName)}&type=movie`;
    const result2 = await fetchJSON(url2);
    
    if (!result2 || result2.Response === 'False' || !result2.Search) {
      return null;
    }
    
    // Encontrar mais próximo do ano
    let best = null;
    let bestDiff = Infinity;
    
    for (const m of result2.Search) {
      if (!m.Poster || m.Poster === 'N/A') continue;
      const mYear = parseInt(m.Year);
      const diff = year ? Math.abs(year - mYear) : 0;
      
      console.log(`       → "${m.Title}" (${m.Year}) - diff: ${diff}`);
      
      if (diff < bestDiff) {
        bestDiff = diff;
        best = { name: m.Title, year: m.Year, image: m.Poster };
      }
    }
    return best;
  }
  
  // Primeiro resultado válido
  for (const m of result.Search) {
    if (m.Poster && m.Poster !== 'N/A') {
      console.log(`       ✓ "${m.Title}" (${m.Year})`);
      return { name: m.Title, year: m.Year, image: m.Poster };
    }
  }
  return null;
}

// Encontrar exemplos problemáticos nos dados
async function findProblematicCases() {
  console.log('='.repeat(70));
  console.log('🔎 BUSCANDO CASOS PROBLEMÁTICOS NOS DADOS');
  console.log('='.repeat(70));
  
  const problematicNames = ['one piece', 'avatar', 'batman', 'dune', 'lion king', 'aladdin'];
  const found = [];
  
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json') && f !== 'categories.json');
  
  for (const file of files) {
    const content = fs.readFileSync(path.join(DATA_DIR, file), 'utf8');
    const items = JSON.parse(content);
    
    for (const item of items) {
      const nameLower = item.name.toLowerCase();
      
      for (const prob of problematicNames) {
        if (nameLower.includes(prob)) {
          found.push({
            name: item.name,
            type: item.type,
            category: item.category,
            currentLogo: item.logo,
            file: file
          });
          break;
        }
      }
    }
  }
  
  // Agrupar por nome base
  const grouped = {};
  for (const item of found) {
    const baseName = cleanName(item.name);
    if (!grouped[baseName]) {
      grouped[baseName] = [];
    }
    grouped[baseName].push(item);
  }
  
  // Mostrar apenas os que têm múltiplas versões
  console.log('\n📊 CASOS COM MÚLTIPLAS VERSÕES:\n');
  
  const testCases = [];
  
  for (const [baseName, items] of Object.entries(grouped)) {
    // Pegar um exemplo de cada tipo/categoria
    const seen = new Set();
    
    for (const item of items) {
      const key = `${item.type}|${item.category}`;
      if (!seen.has(key)) {
        seen.add(key);
        testCases.push(item);
        console.log(`  • "${item.name}"`);
        console.log(`    Tipo: ${item.type}, Categoria: ${item.category}`);
        console.log(`    Arquivo: ${item.file}`);
        console.log('');
      }
    }
  }
  
  return testCases.slice(0, 15); // Limitar a 15 testes
}

// Testar busca
async function testSearch(testCases) {
  console.log('\n' + '='.repeat(70));
  console.log('🧪 TESTANDO BUSCA PRECISA');
  console.log('='.repeat(70));
  
  for (const tc of testCases) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`📌 ${tc.name}`);
    console.log(`   Tipo: ${tc.type}, Categoria: ${tc.category}`);
    console.log(`   Logo atual: ${tc.currentLogo?.substring(0, 60)}...`);
    
    const year = extractYear(tc.name);
    
    let result;
    if (tc.type === 'series') {
      result = await searchSeriesTVMaze(tc.name, year, tc.category);
    } else {
      result = await searchMovieOMDb(tc.name, year);
    }
    
    if (result) {
      console.log(`\n   ✅ MELHOR MATCH: "${result.name}" (${result.year})`);
      console.log(`   📷 Nova imagem: ${result.image}`);
      
      if (result.image === tc.currentLogo) {
        console.log(`   ✓ IMAGEM JÁ CORRETA!`);
      } else {
        console.log(`   ⚠️ IMAGEM DIFERENTE - SERÁ ATUALIZADA`);
      }
    } else {
      console.log(`\n   ❌ NENHUM RESULTADO ENCONTRADO`);
    }
    
    await new Promise(r => setTimeout(r, 300));
  }
}

// Main
async function main() {
  const testCases = await findProblematicCases();
  
  if (testCases.length === 0) {
    console.log('Nenhum caso problemático encontrado!');
    return;
  }
  
  await testSearch(testCases);
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ TESTE CONCLUÍDO');
  console.log('='.repeat(70));
}

main().catch(console.error);
