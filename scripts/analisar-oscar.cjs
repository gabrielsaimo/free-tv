const fs = require('fs');
const readline = require('readline');

const oscarData = JSON.parse(fs.readFileSync('./public/data/enriched/oscar-2025.json', 'utf8'));

console.log('\n========== ANALISE OSCAR-2025.JSON vs CanaisBR06.M3U ==========\n');

console.log('FILMES NO oscar-2025.json:\n');
oscarData.forEach((f, i) => {
  const hasUrl = f.url && f.url.length > 10;
  const status = hasUrl ? '[COM URL]' : '[SEM URL]';
  console.log(`   ${(i+1).toString().padStart(2)}. ${status} ${f.name}`);
});

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
  console.log(`Total de linhas no M3U: ${m3uLines.length}\n`);
  
  console.log('========== BUSCAS ESPECIFICAS ==========\n');

  oscarData.forEach(filme => {
    const normalized = filme.name.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\[.*?\]/g, '')
      .replace(/\(\d{4}\)/g, '')
      .replace(/[^a-z0-9]+/g, '');

    console.log(`\nProcurando: "${filme.name}"`);
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
      console.log('  X NAO ENCONTROU NO M3U!');
      
      // Tentar busca parcial
      const partialMatches = m3uLines.filter(line => 
        line.includes('tvg-name=') && 
        line.toLowerCase().includes(filme.name.split(' ')[0].toLowerCase())
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
      console.log(`  OK ENCONTROU ${matches.length} match(es)`);
      matches.forEach(match => {
        const nameMatch = match.match(/tvg-name="([^"]+)"/);
        if (nameMatch) {
          console.log(`    - ${nameMatch[1]}`);
        }
      });
    }
  });
});
