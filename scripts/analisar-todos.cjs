const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ENRICHED_DIR = './public/data/enriched';

console.log('\n╔════════════════════════════════════════════════════════════════════════════╗');
console.log('║           ANALISE COMPLETA - TODOS OS ARQUIVOS JSON ENRICHED              ║');
console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');

// Ler todos os arquivos JSON
const jsonFiles = fs.readdirSync(ENRICHED_DIR).filter(f => f.endsWith('.json'));

console.log(`Total de arquivos JSON encontrados: ${jsonFiles.length}\n`);

// Ler o M3U uma vez
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
  console.log(`Linhas do M3U carregadas: ${m3uLines.length}\n`);
  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                        PROCESSANDO ARQUIVOS...                            ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');

  const results = [];

  jsonFiles.forEach(jsonFile => {
    const filePath = path.join(ENRICHED_DIR, jsonFile);
    
    try {
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(fileContent);
      
      if (!Array.isArray(data)) {
        results.push({
          arquivo: jsonFile,
          total: 'N/A',
          encontrados: 'N/A',
          percentual: 'N/A',
          status: 'ERRO: nao eh array'
        });
        return;
      }

      let encontrados = 0;
      const naoEncontrados = [];

      data.forEach(item => {
        const normalized = item.name.toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/\[.*?\]/g, '')
          .replace(/\(\d{4}\)/g, '')
          .replace(/[^a-z0-9]+/g, '');

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

        if (matches.length > 0) {
          encontrados++;
        } else {
          if (naoEncontrados.length < 3) { // Guardar apenas os 3 primeiros
            naoEncontrados.push(item.name);
          }
        }
      });

      const percentual = ((encontrados / data.length) * 100).toFixed(1);
      const status = percentual == 100 ? '✓ OK' : percentual >= 80 ? '⚠ PARCIAL' : '✗ FALHA';

      results.push({
        arquivo: jsonFile,
        total: data.length,
        encontrados: encontrados,
        naoEncontrados: naoEncontrados,
        percentual: parseFloat(percentual),
        status: status
      });

    } catch (error) {
      results.push({
        arquivo: jsonFile,
        total: 'ERRO',
        encontrados: 'ERRO',
        percentual: 'ERRO',
        status: 'ERRO: ' + error.message.substring(0, 30)
      });
    }
  });

  // Ordenar por percentual (descendente)
  results.sort((a, b) => {
    if (typeof a.percentual !== 'number' || typeof b.percentual !== 'number') {
      return 0;
    }
    return b.percentual - a.percentual;
  });

  // Mostrar resultados
  console.log('RESULTADO DETALHADO:\n');
  
  results.forEach((r, i) => {
    if (typeof r.percentual === 'number') {
      console.log(`${(i+1).toString().padStart(2)}. ${r.status} ${r.arquivo.padEnd(40)} ${r.encontrados}/${r.total} (${r.percentual}%)`);
      if (r.naoEncontrados && r.naoEncontrados.length > 0) {
        console.log(`    Nao encontrados: ${r.naoEncontrados.slice(0, 2).join(', ')}`);
        if (r.naoEncontrados.length > 2) {
          console.log(`                    ... + ${r.naoEncontrados.length - 2} mais`);
        }
      }
    } else {
      console.log(`${(i+1).toString().padStart(2)}. ${r.status.padEnd(45)} ${r.arquivo}`);
    }
  });

  // Estatisticas finais
  console.log('\n╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                         ESTATISTICAS FINAIS                               ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');

  const ok = results.filter(r => r.status === '✓ OK').length;
  const parcial = results.filter(r => r.status === '⚠ PARCIAL').length;
  const falha = results.filter(r => r.status === '✗ FALHA').length;
  const erro = results.filter(r => r.status.includes('ERRO')).length;

  console.log(`✓ Arquivos 100% atualizados: ${ok}/${jsonFiles.length}`);
  console.log(`⚠ Arquivos com atualizacao parcial (80-99%): ${parcial}/${jsonFiles.length}`);
  console.log(`✗ Arquivos com falhas (<80%): ${falha}/${jsonFiles.length}`);
  console.log(`✗ Arquivos com erro: ${erro}/${jsonFiles.length}\n`);

  // Total de items
  const totalItems = results
    .filter(r => typeof r.total === 'number')
    .reduce((sum, r) => sum + r.total, 0);
  
  const totalEncontrados = results
    .filter(r => typeof r.encontrados === 'number')
    .reduce((sum, r) => sum + r.encontrados, 0);

  const totalPercentual = ((totalEncontrados / totalItems) * 100).toFixed(2);

  console.log(`Total de items processados: ${totalItems}`);
  console.log(`Total de items encontrados: ${totalEncontrados}`);
  console.log(`Percentual geral: ${totalPercentual}%\n`);
});
