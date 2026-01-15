/**
 * TESTE RÁPIDO - Verificar se a busca diferencia corretamente:
 * - One Piece (1999) - Anime
 * - One Piece (2023) - Live-action Netflix
 */

const https = require('https');

function fetchJSON(url) {
  return new Promise((resolve) => {
    https.get(url, { timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

async function testOnePiece() {
  console.log('='.repeat(60));
  console.log('🧪 TESTE: Diferenciação One Piece Anime vs Live-action');
  console.log('='.repeat(60));
  
  const url = 'https://api.tvmaze.com/search/shows?q=One%20Piece';
  const results = await fetchJSON(url);
  
  console.log('\n📋 Resultados da API TVMaze:\n');
  
  for (const r of results.slice(0, 5)) {
    const show = r.show;
    const year = show.premiered ? show.premiered.split('-')[0] : 'N/A';
    const isAnime = show.type === 'Animation' || (show.genres || []).includes('Anime');
    const platform = show.webChannel?.name || show.network?.name || 'N/A';
    
    console.log(`  📺 "${show.name}" (${year})`);
    console.log(`     Tipo: ${show.type} | Anime: ${isAnime ? 'SIM' : 'NÃO'}`);
    console.log(`     Plataforma: ${platform}`);
    console.log(`     Score API: ${r.score.toFixed(3)}`);
    console.log(`     Imagem: ${show.image?.medium || 'N/A'}`);
    console.log('');
  }
  
  // Teste 1: One Piece (1999) - Anime - Crunchyroll
  console.log('\n' + '─'.repeat(60));
  console.log('📌 TESTE 1: One Piece (1999) S15E100 - Categoria: Crunchyroll');
  console.log('   Esperado: Anime (1999)');
  
  let best1 = null, bestScore1 = -Infinity;
  const expectAnime1 = true; // Crunchyroll = anime
  const year1 = 1999;
  
  for (const r of results) {
    const show = r.show;
    if (!show.image) continue;
    
    let score = r.score * 10;
    const showYear = show.premiered ? parseInt(show.premiered.split('-')[0]) : null;
    const isAnime = show.type === 'Animation' || (show.genres || []).includes('Anime');
    
    // Pontuação por ano
    if (showYear) {
      const diff = Math.abs(year1 - showYear);
      if (diff === 0) score += 50;
      else if (diff === 1) score += 20;
      else score -= diff * 10;
    }
    
    // Pontuação por tipo
    if (expectAnime1 === isAnime) score += 30;
    else score -= 40;
    
    console.log(`   → "${show.name}" (${showYear}) [${isAnime ? 'ANIME' : 'LIVE'}] = Score: ${score.toFixed(1)}`);
    
    if (score > bestScore1) {
      bestScore1 = score;
      best1 = { name: show.name, year: showYear, isAnime };
    }
  }
  
  console.log(`\n   ✅ RESULTADO: "${best1.name}" (${best1.year}) - ${best1.isAnime ? 'ANIME' : 'LIVE-ACTION'}`);
  console.log(`   ${best1.year === 1999 && best1.isAnime ? '✓ CORRETO!' : '✗ ERRADO!'}`);
  
  // Teste 2: One Piece S01E01 - Netflix (live-action 2023)
  console.log('\n' + '─'.repeat(60));
  console.log('📌 TESTE 2: One Piece S01E01 - Categoria: Netflix');
  console.log('   Esperado: Live-action (2023)');
  
  let best2 = null, bestScore2 = -Infinity;
  const expectAnime2 = false; // Netflix = não anime
  const year2 = null; // Sem ano no nome
  
  for (const r of results) {
    const show = r.show;
    if (!show.image) continue;
    
    let score = r.score * 10;
    const showYear = show.premiered ? parseInt(show.premiered.split('-')[0]) : null;
    const isAnime = show.type === 'Animation' || (show.genres || []).includes('Anime');
    const isNetflix = show.webChannel?.name === 'Netflix';
    
    // Pontuação por tipo
    if (expectAnime2 === isAnime) score += 30;
    else score -= 40;
    
    // Bonus Netflix
    if (isNetflix) score += 20;
    
    console.log(`   → "${show.name}" (${showYear}) [${isAnime ? 'ANIME' : 'LIVE'}] Netflix:${isNetflix} = Score: ${score.toFixed(1)}`);
    
    if (score > bestScore2) {
      bestScore2 = score;
      best2 = { name: show.name, year: showYear, isAnime };
    }
  }
  
  console.log(`\n   ✅ RESULTADO: "${best2.name}" (${best2.year}) - ${best2.isAnime ? 'ANIME' : 'LIVE-ACTION'}`);
  console.log(`   ${best2.year === 2023 && !best2.isAnime ? '✓ CORRETO!' : '✗ ERRADO!'}`);
  
  console.log('\n' + '='.repeat(60));
  console.log('Teste concluído!');
}

testOnePiece().catch(console.error);
