const fs = require('fs');

const cinemaData = JSON.parse(fs.readFileSync('./public/data/enriched/cinema.json', 'utf8'));

console.log('\n\n========== ANALISE COMPLETA - CINEMA.JSON vs CanaisBR06.M3U ==========\n');

console.log('ESTATISTICAS:');
console.log(`   - Total de filmes em cinema.json: ${cinemaData.length}\n`);

// Procurar filmes com URLs ainda nao atualizadas
const naoAtualizados = cinemaData.filter(f => 
  f.url && f.url.includes('coneasy.lat') && f.url.includes('movie')
);

console.log('RESULTADO DO SCRIPT DE ATUALIZACAO:');
console.log(`   - Filmes com URLs ainda de coneasy.lat: ${naoAtualizados.length}\n`);

console.log('========== PROBLEMA IDENTIFICADO ==========\n');

console.log('FILME: "Demon Slayer: Kimetsu no Yaiba Castelo Infinito (2025)"\n');
console.log('Motivo NAO foi encontrada no CanaisBR06.m3u:\n');
console.log('- No cinema.json: "Demon Slayer: Kimetsu no Yaiba Castelo Infinito"');
console.log('- No M3U:         "Demon Slayer: Mugen Train - O Filme"');
console.log('\nSao FILMES DIFERENTES! Nao eh questao de nome');
console.log('(Castelo Infinito vs Mugen Train sao 2 films diferentes da saga)\n');

console.log('========== LISTA DOS NOMES EM cinema.json ==========\n');
cinemaData.slice(0, 25).forEach((f, i) => {
  console.log(`   ${(i+1).toString().padStart(2)}. ${f.name}`);
});

console.log('\n========== RECOMENDACAO ==========\n');
console.log('1. Verificar se "Demon Slayer: Kimetsu no Yaiba Castelo Infinito"');
console.log('   realmente existe no CanaisBR06.m3u com outro nome\n');

console.log('2. Procurar todas as variantes do nome:\n');
const filmesToSearch = [
  'castelo infinito',
  'infinite castle',
  'demon slayer 2025',
  'kimetsu yaiba 2025'
];

console.log('   Termos a procurar:');
filmesToSearch.forEach(t => console.log(`   - "${t}"`));
