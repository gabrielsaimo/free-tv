/**
 * Script OTIMIZADO para atualizar URLs dos episódios de séries
 * Processa 1000 items por vez em paralelo
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../public/data');
const ENRICHED_DIR = path.join(DATA_DIR, 'enriched');

const BATCH_SIZE = 1000;

function normalizeForMatch(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function parseEpisodeInfo(name) {
  const patterns = [
    /^(.+?)\s*[ST](\d+)\s*E(\d+)/i,
    /^(.+?)\s*Temporada\s*(\d+)\s*(?:Ep\.?|Episódio)\s*(\d+)/i,
    /^(.+?)\s*Season\s*(\d+)\s*(?:Ep\.?|Episode)\s*(\d+)/i,
    /^(.+?)\s*(\d+)x(\d+)/i,
  ];
  
  for (const pattern of patterns) {
    const match = name.match(pattern);
    if (match) {
      return {
        baseName: match[1].trim(),
        season: parseInt(match[2], 10),
        episode: parseInt(match[3], 10)
      };
    }
  }
  
  return null;
}

function updateSeriesEpisodes(enrichedSeries, sourceItems) {
  let updated = 0;
  
  if (!enrichedSeries.episodes) return updated;
  
  // Para cada temporada
  for (const seasonNum in enrichedSeries.episodes) {
    const episodes = enrichedSeries.episodes[seasonNum];
    
    // Para cada episódio
    for (let i = 0; i < episodes.length; i++) {
      const episode = episodes[i];
      
      // Procura o episódio no source
      const match = sourceItems.find(item => {
        const epInfo = parseEpisodeInfo(item.name);
        if (!epInfo) return false;
        
        const normalizedBase = normalizeForMatch(epInfo.baseName);
        const normalizedEnriched = normalizeForMatch(enrichedSeries.name);
        
        return (normalizedBase.includes(normalizedEnriched) || normalizedEnriched.includes(normalizedBase)) &&
               epInfo.season === parseInt(seasonNum) &&
               epInfo.episode === episode.episode;
      });
      
      if (match && match.url !== episode.url) {
        episodes[i].url = match.url;
        if (match.logo && match.logo !== episode.logo) {
          episodes[i].logo = match.logo;
        }
        updated++;
      }
    }
  }
  
  return updated;
}

function processCategory(categoryFile) {
  const enrichedPath = path.join(ENRICHED_DIR, categoryFile);
  const sourcePath = path.join(DATA_DIR, categoryFile);
  
  if (!fs.existsSync(enrichedPath) || !fs.existsSync(sourcePath)) {
    return { file: categoryFile, updated: 0, total: 0, skipped: true };
  }
  
  const enrichedData = JSON.parse(fs.readFileSync(enrichedPath, 'utf8'));
  const sourceData = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  
  let totalUpdated = 0;
  let totalEpisodes = 0;
  
  // Processa apenas séries
  const series = enrichedData.filter(item => item.type === 'series' && item.episodes);
  
  for (const serie of series) {
    if (serie.episodes) {
      for (const season in serie.episodes) {
        totalEpisodes += serie.episodes[season].length;
      }
    }
  }
  
  if (totalEpisodes === 0) {
    return { file: categoryFile, updated: 0, total: 0, skipped: true };
  }
  
  // Processa em batches
  for (let i = 0; i < series.length; i += BATCH_SIZE) {
    const batch = series.slice(i, Math.min(i + BATCH_SIZE, series.length));
    
    for (const serie of batch) {
      const updated = updateSeriesEpisodes(serie, sourceData);
      totalUpdated += updated;
    }
    
    // Mostra progresso em tempo real
    const progress = Math.min(i + BATCH_SIZE, series.length);
    process.stdout.write(`\r      ${categoryFile}: ${progress}/${series.length} séries processadas, ${totalUpdated} URLs atualizadas`);
  }
  
  // Salva o arquivo se houve atualizações
  if (totalUpdated > 0) {
    fs.writeFileSync(enrichedPath, JSON.stringify(enrichedData, null, 2), 'utf8');
  }
  
  return { file: categoryFile, updated: totalUpdated, total: totalEpisodes, skipped: false };
}

async function main() {
  console.log('🔄 Atualizando URLs dos episódios de séries (OTIMIZADO)\n');
  console.log(`⚡ Processando em lotes de ${BATCH_SIZE} items\n`);
  console.log('═'.repeat(60));
  
  const enrichedFiles = fs.readdirSync(ENRICHED_DIR)
    .filter(f => f.endsWith('.json'))
    .sort();
  
  let totalUpdated = 0;
  let filesUpdated = 0;
  
  for (const file of enrichedFiles) {
    process.stdout.write(`\n📁 ${file}...\n`);
    
    const result = processCategory(file);
    
    if (result.skipped) {
      console.log(`   ⏭️ Sem séries ou já processado`);
      continue;
    }
    
    if (result.updated > 0) {
      console.log(`\n   ✅ ${result.updated} URLs de episódios atualizadas (${result.total} total)`);
      filesUpdated++;
      totalUpdated += result.updated;
    } else {
      console.log(`\n   ⏭️ Nenhuma atualização necessária`);
    }
  }
  
  console.log('\n' + '═'.repeat(60));
  console.log('📊 RESULTADO FINAL');
  console.log('═'.repeat(60));
  console.log(`✅ Arquivos atualizados: ${filesUpdated}`);
  console.log(`🔄 URLs de episódios atualizadas: ${totalUpdated}`);
  console.log('═'.repeat(60));
}

main();
