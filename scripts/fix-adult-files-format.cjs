/**
 * Script para corrigir formato dos arquivos adultos
 * Padroniza com acao.json mas sem dados TMDB
 */

const fs = require('fs');
const path = require('path');

const ENRICHED_DIR = path.join(__dirname, '../public/data/enriched');

const ADULT_FILES = [
  'hot-adultos.json',
  'hot-adultos-legendado.json',
  'hot-adultos-bella-da-semana.json'
];

function fixAdultFile(fileName) {
  const filePath = path.join(ENRICHED_DIR, fileName);
  
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️ Arquivo não encontrado: ${fileName}`);
    return;
  }
  
  console.log(`📝 Processando: ${fileName}`);
  
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  
  // Corrige cada item
  const fixed = data.map(item => ({
    id: item.id,
    name: item.name,
    url: item.url,
    ...(item.logo && { logo: item.logo }),
    category: item.category,
    type: item.type,
    isAdult: true, // Corrige para true
    tmdb: null // Adiciona tmdb: null
  }));
  
  // Salva o arquivo corrigido
  fs.writeFileSync(filePath, JSON.stringify(fixed, null, 2), 'utf8');
  
  console.log(`✅ ${fileName} - ${fixed.length} items corrigidos`);
}

function main() {
  console.log('🔧 Corrigindo formato dos arquivos adultos\n');
  console.log('═'.repeat(60));
  
  for (const file of ADULT_FILES) {
    fixAdultFile(file);
  }
  
  console.log('\n═'.repeat(60));
  console.log('✅ Correção concluída!');
}

main();
