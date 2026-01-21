const fs = require('fs');
const path = require('path');

const enrichedDir = path.join(__dirname, '../public/data/enriched');

function removeDuplicateEpisodes() {
  const files = fs.readdirSync(enrichedDir).filter(f => f.endsWith('.json'));
  
  let totalFilesProcessed = 0;
  let totalDuplicatesRemoved = 0;
  const report = [];

  files.forEach(file => {
    const filePath = path.join(enrichedDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    
    try {
      const data = Array.isArray(JSON.parse(content)) ? JSON.parse(content) : [JSON.parse(content)];
      let fileHasChanges = false;
      let fileDuplicatesRemoved = 0;

      data.forEach(item => {
        if (item.episodes && typeof item.episodes === 'object') {
          // Para cada temporada
          Object.keys(item.episodes).forEach(season => {
            const episodeList = item.episodes[season];
            
            if (Array.isArray(episodeList)) {
              const seenUrls = new Set();
              const filteredEpisodes = [];

              episodeList.forEach(episode => {
                // Usar a URL como identificador único
                const episodeUrl = episode.url;
                
                if (!seenUrls.has(episodeUrl)) {
                  seenUrls.add(episodeUrl);
                  filteredEpisodes.push(episode);
                } else {
                  // Duplicado encontrado
                  fileDuplicatesRemoved++;
                  fileHasChanges = true;
                }
              });

              if (filteredEpisodes.length !== episodeList.length) {
                item.episodes[season] = filteredEpisodes;
              }
            }
          });
        }
      });

      if (fileHasChanges) {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        totalFilesProcessed++;
        totalDuplicatesRemoved += fileDuplicatesRemoved;
        report.push(`✓ ${file}: ${fileDuplicatesRemoved} duplicados removidos`);
      }
    } catch (error) {
      console.error(`Erro ao processar ${file}:`, error.message);
    }
  });

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📊 RELATÓRIO DE REMOÇÃO DE EPISÓDIOS DUPLICADOS');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  if (report.length === 0) {
    console.log('✓ Nenhum arquivo com duplicatas encontrado!');
  } else {
    report.forEach(r => console.log(r));
  }
  
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`Total de arquivos modificados: ${totalFilesProcessed}`);
  console.log(`Total de duplicatas removidas: ${totalDuplicatesRemoved}`);
  console.log('═══════════════════════════════════════════════════════════\n');
}

removeDuplicateEpisodes();
