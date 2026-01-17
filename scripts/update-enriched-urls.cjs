/**
 * Script para atualizar URLs dos arquivos enriched com as URLs novas do M3U8
 * Mantém todos os dados do TMDB, apenas atualiza as URLs
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../public/data');
const ENRICHED_DIR = path.join(DATA_DIR, 'enriched');

function normalizeForMatch(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Remove ano entre parênteses
    .replace(/\(\d{4}\)/g, '')
    // Remove [L], [HD], [4K], etc
    .replace(/\[.*?\]/g, '')
    // Remove espaços extras e caracteres especiais
    .replace(/[^a-z0-9]+/g, '');
}

function normalizeEpisodeName(name) {
  // Normaliza especificamente para episódios
  // Remove ano, tags, espaços extras mas mantém S/E
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\(\d{4}\)/g, '') // Remove (2018)
    .replace(/\[l\]/gi, '') // Remove [L]
    .replace(/\[.*?\]/g, '') // Remove outras tags
    .replace(/\s+/g, '') // Remove todos os espaços
    .trim();
}

function findBestMatch(enrichedItem, sourceItems) {
  const enrichedName = normalizeForMatch(enrichedItem.name);
  
  // Tenta match exato por nome
  for (const item of sourceItems) {
    if (normalizeForMatch(item.name) === enrichedName) {
      return item;
    }
  }
  
  // Tenta match parcial (começa com)
  for (const item of sourceItems) {
    const itemName = normalizeForMatch(item.name);
    if (enrichedName.includes(itemName) || itemName.includes(enrichedName)) {
      return item;
    }
  }
  
  return null;
}

function updateCategory(categoryFile) {
  const enrichedPath = path.join(ENRICHED_DIR, categoryFile);
  const sourcePath = path.join(DATA_DIR, categoryFile);
  
  // Verifica se ambos os arquivos existem
  if (!fs.existsSync(enrichedPath)) {
    return { updated: 0, notFound: 0, total: 0, episodesUpdated: 0, skipped: true };
  }
  
  if (!fs.existsSync(sourcePath)) {
    console.log(`   ⚠️ Arquivo fonte não encontrado: ${categoryFile}`);
    return { updated: 0, notFound: 0, total: 0, episodesUpdated: 0, skipped: true };
  }
  
  // Lê os arquivos
  const enrichedData = JSON.parse(fs.readFileSync(enrichedPath, 'utf8'));
  const sourceData = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  
  let updated = 0;
  let notFound = 0;
  let episodesUpdated = 0;
  
  // Atualiza cada item enriched
  for (const enrichedItem of enrichedData) {
    // Se for série com episódios, atualiza os episódios
    if (enrichedItem.type === 'series' && enrichedItem.episodes) {
      // Para cada temporada
      for (const season in enrichedItem.episodes) {
        const episodes = enrichedItem.episodes[season];
        
        // Para cada episódio
        for (const episode of episodes) {
          const enrichedNormalized = normalizeEpisodeName(episode.name);
          
          // Procura o episódio correspondente no source
          const sourceEpisode = sourceData.find(s => {
            const sourceNormalized = normalizeEpisodeName(s.name);
            return sourceNormalized === enrichedNormalized;
          });
          
          if (sourceEpisode && sourceEpisode.url !== episode.url) {
            episode.url = sourceEpisode.url;
            if (sourceEpisode.logo) {
              episode.logo = sourceEpisode.logo;
            }
            episodesUpdated++;
          }
        }
      }
      updated++;
    } else {
      // Para filmes, mantém o comportamento anterior
      const match = findBestMatch(enrichedItem, sourceData);
      
      if (match && match.url !== enrichedItem.url) {
        // Atualiza a URL mantendo todos os outros dados
        enrichedItem.url = match.url;
        
        // Atualiza o logo se tiver um novo
        if (match.logo && match.logo !== enrichedItem.logo) {
          enrichedItem.logo = match.logo;
        }
        
        updated++;
      } else if (!match) {
        notFound++;
      }
    }
  }
  
  // Salva o arquivo atualizado
  if (updated > 0 || episodesUpdated > 0) {
    fs.writeFileSync(enrichedPath, JSON.stringify(enrichedData, null, 2), 'utf8');
  }
  
  return {
    updated,
    notFound,
    total: enrichedData.length,
    episodesUpdated,
    skipped: false
  };
}

function main() {
  console.log('🔄 Atualizando URLs dos arquivos enriched\n');
  console.log('═'.repeat(60));
  
  if (!fs.existsSync(ENRICHED_DIR)) {
    console.error('❌ Diretório enriched não encontrado!');
    process.exit(1);
  }
  
  // Lista todos os arquivos enriched
  const enrichedFiles = fs.readdirSync(ENRICHED_DIR)
    .filter(f => f.endsWith('.json'))
    .sort();
  
  console.log(`📁 ${enrichedFiles.length} arquivos para atualizar\n`);
  
  let totalUpdated = 0;
  let totalNotFound = 0;
  let totalProcessed = 0;
  let totalEpisodesUpdated = 0;
  let filesUpdated = 0;
  let filesSkipped = 0;
  
  for (const file of enrichedFiles) {
    const result = updateCategory(file);
    
    if (result.skipped) {
      filesSkipped++;
      continue;
    }
    
    totalProcessed += result.total;
    totalUpdated += result.updated;
    totalNotFound += result.notFound;
    totalEpisodesUpdated += result.episodesUpdated;
    
    if (result.updated > 0 || result.episodesUpdated > 0) {
      filesUpdated++;
      console.log(`✅ ${file}`);
      if (result.updated > 0) {
        console.log(`   📊 ${result.updated} URLs atualizadas de ${result.total} items`);
      }
      if (result.episodesUpdated > 0) {
        console.log(`   📺 ${result.episodesUpdated} episódios atualizados`);
      }
      if (result.notFound > 0) {
        console.log(`   ⚠️ ${result.notFound} items sem match`);
      }
    } else {
      console.log(`⏭️ ${file} (sem alterações)`);
    }
  }
  
  console.log('\n' + '═'.repeat(60));
  console.log('📊 RESULTADO FINAL');
  console.log('═'.repeat(60));
  console.log(`📁 Arquivos processados: ${enrichedFiles.length - filesSkipped}`);
  console.log(`✅ Arquivos atualizados: ${filesUpdated}`);
  console.log(`⏭️ Arquivos pulados: ${filesSkipped}`);
  console.log(`📝 Total de items: ${totalProcessed}`);
  console.log(`🔄 URLs atualizadas: ${totalUpdated}`);
  console.log(`📺 Episódios atualizados: ${totalEpisodesUpdated}`);
  console.log(`⚠️ Items sem match: ${totalNotFound}`);
  console.log('═'.repeat(60));
  console.log('\n✅ Atualização concluída!');
}

main();
