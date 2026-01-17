/**
 * Script para processar CanaisBR03.m3u8 e gerar arquivos JSON por categoria
 */

const fs = require('fs');
const path = require('path');

const M3U8_FILE = path.join(__dirname, '../public/data/CanaisBR03.m3u8');
const OUTPUT_DIR = path.join(__dirname, '../public/data');

// Categorias a pular
const SKIP_CATEGORIES = [
  'adultos',
  'adultos-bella-da-semana',
  'adultos-legendado'
];

function generateId(name, url) {
  const urlHash = url.split('/').slice(-1)[0].replace(/\.[^.]+$/, '');
  const nameSlug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 60);
  return `${nameSlug}-${urlHash}`.substring(0, 100);
}

function normalizeCategoryName(category) {
  return category
    .replace(/^♦️\s*/, '')
    .replace(/\s*✔️$/, '')
    .replace(/\s*☠$/, '')
    .trim();
}

function categoryToFileName(category) {
  return category
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function isSeriesContent(name) {
  const patterns = [
    /S\d+\s*E\d+/i,
    /T\d+\s*E\d+/i,
    /\d+x\d+/i,
    /Temporada\s*\d+/i,
    /Season\s*\d+/i,
  ];
  return patterns.some(pattern => pattern.test(name));
}

function parseM3U8() {
  console.log('📖 Lendo arquivo M3U8...');
  const content = fs.readFileSync(M3U8_FILE, 'utf-8');
  const lines = content.split('\n');
  
  const movies = [];
  let currentEntry = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (line.startsWith('#EXTINF:')) {
      // Extrai informações do EXTINF
      const nameMatch = line.match(/,(.+)$/);
      const groupMatch = line.match(/group-title="([^"]+)"/);
      const logoMatch = line.match(/tvg-logo="([^"]+)"/);
      
      currentEntry = {
        name: nameMatch ? nameMatch[1].trim() : 'Sem Nome',
        category: groupMatch ? normalizeCategoryName(groupMatch[1]) : 'Outros',
        logo: logoMatch ? logoMatch[1] : null
      };
    } else if (line.startsWith('http') && currentEntry) {
      // URL do vídeo
      const url = line.trim();
      
      movies.push({
        id: generateId(currentEntry.name, url),
        name: currentEntry.name,
        url: url,
        logo: currentEntry.logo,
        category: currentEntry.category,
        type: isSeriesContent(currentEntry.name) ? 'series' : 'movie',
        isAdult: false
      });
      
      currentEntry = null;
    }
  }
  
  return movies;
}

function main() {
  console.log('🎬 Processando CanaisBR03.m3u8\n');
  
  if (!fs.existsSync(M3U8_FILE)) {
    console.error('❌ Arquivo não encontrado:', M3U8_FILE);
    process.exit(1);
  }
  
  // Parse do arquivo
  const movies = parseM3U8();
  console.log(`✅ ${movies.length} items encontrados\n`);
  
  // Agrupa por categoria
  const categoryData = new Map();
  movies.forEach(movie => {
    if (!categoryData.has(movie.category)) {
      categoryData.set(movie.category, []);
    }
    categoryData.get(movie.category).push(movie);
  });
  
  console.log(`📁 ${categoryData.size} categorias encontradas\n`);
  
  // Limpa arquivos JSON antigos (exceto enriched)
  console.log('🧹 Limpando arquivos antigos...');
  const existingFiles = fs.readdirSync(OUTPUT_DIR)
    .filter(f => f.endsWith('.json') && f !== 'categories.json');
  existingFiles.forEach(f => {
    fs.unlinkSync(path.join(OUTPUT_DIR, f));
    console.log(`   ❌ Removido: ${f}`);
  });
  
  // Salva cada categoria em um arquivo JSON
  console.log('\n💾 Salvando arquivos JSON...');
  const categoryIndex = [];
  
  categoryData.forEach((items, category) => {
    const fileName = categoryToFileName(category) + '.json';
    const filePath = path.join(OUTPUT_DIR, fileName);
    
    fs.writeFileSync(filePath, JSON.stringify(items, null, 2), 'utf8');
    console.log(`   ✅ ${fileName} (${items.length} items)`);
    
    categoryIndex.push({
      name: category,
      file: fileName,
      count: items.length,
      isAdult: false,
      hasMovies: items.some(i => i.type === 'movie'),
      hasSeries: items.some(i => i.type === 'series')
    });
  });
  
  // Salva o índice de categorias
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'categories.json'),
    JSON.stringify(categoryIndex, null, 2),
    'utf8'
  );
  
  console.log('\n📊 Estatísticas:');
  console.log(`   Total de items: ${movies.length}`);
  console.log(`   Categorias: ${categoryData.size}`);
  console.log(`   Filmes: ${movies.filter(m => m.type === 'movie').length}`);
  console.log(`   Séries: ${movies.filter(m => m.type === 'series').length}`);
  
  console.log('\n✅ Arquivos JSON criados com sucesso!');
  console.log(`📂 Diretório: ${OUTPUT_DIR}`);
}

main();
