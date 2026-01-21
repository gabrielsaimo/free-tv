const fs = require('fs');
const readline = require('readline');

const cinemaData = JSON.parse(fs.readFileSync('./public/data/enriched/cinema.json', 'utf8'));

console.log('\n========== ANALISE DE DISCREPANCIAS - CINEMA.JSON ==========\n');

// Extrair alguns filmes de exemplo
const exemplos = cinemaData.slice(0, 15);

console.log('FILMES NO cinema.json (primeiros 15):');
exemplos.forEach((f, i) => console.log(`  ${i+1}. ${f.name}`));

console.log('\n========== BUSCANDO MATCHES NO M3U ==========\n');

// Ler o M3U file
const fileStream = fs.createReadStream('./public/data/CanaisBR06.m3u');
const rl = readline.createInterface({
  input: fileStream,
  crlfDelay: Infinity
});

let m3uLines = [];
rl.on('line', (line) => {
  m3uLines.push(line);
});

rl.on('close', () => {
  console.log(`\nTotal de linhas no M3U: ${m3uLines.length}`);
  
  // Procurar alguns filmes
  const filmesToTest = [
    'Demon Slayer: Kimetsu no Yaiba Castelo Infinito (2025)',
    'Tron: Ares [CINEMA] (2025)',
    'Zootopia 2 [CAM] (2025)',
    'Avatar: Fogo e Cinzas [CINEMA] (2025)',
    'A Empregada [CAM] (2025)',
    'Tipos de Gentileza'
  ];

  console.log('\n========== BUSCAS ESPECIFICAS ==========\n');

  filmesToTest.forEach(filme => {
    const normalized = filme.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\[.*?\]/g, '')
      .replace(/\(\d{4}\)/g, '')
      .replace(/[^a-z0-9]+/g, '');

    console.log(`\nProcurando: "${filme}"`);
    console.log(`Normalizado: "${normalized}"`);

    // Procurar no M3U
    const matches = m3uLines.filter(line => {
      if (!line.includes('tvg-name=')) return false;
      const nameMatch = line.match(/tvg-name="([^"]+)"/);
      if (!nameMatch) return false;
      
      const m3uName = nameMatch[1];
      const m3uNormalized = m3uName.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\[.*?\]/g, '')
        .replace(/\(\d{4}\)/g, '')
        .replace(/[^a-z0-9]+/g, '');
      
      return m3uNormalized === normalized;
    });

    if (matches.length === 0) {
      console.log('  ❌ NAO ENCONTROU NO M3U!');
      
      // Tentar busca parcial
      const partialMatches = m3uLines.filter(line => 
        line.includes('tvg-name=') && 
        line.toLowerCase().includes(filme.split(':')[0].toLowerCase().trim())
      );
      
      if (partialMatches.length > 0) {
        console.log('  Achei filmes SIMILARES:');
        partialMatches.slice(0, 3).forEach(match => {
          const nameMatch = match.match(/tvg-name="([^"]+)"/);
          if (nameMatch) {
            console.log(`    - ${nameMatch[1]}`);
          }
        });
      }
    } else {
      console.log(`  ✓ ENCONTROU ${matches.length} match(es)`);
      matches.forEach(match => {
        const nameMatch = match.match(/tvg-name="([^"]+)"/);
        if (nameMatch) {
          console.log(`    - ${nameMatch[1]}`);
        }
      });
    }
  });
});
