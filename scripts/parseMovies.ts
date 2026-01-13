/**
 * Script para parsear os arquivos ListaBR01.m3u8 e ListaBR02.m3u8
 * e gerar dados de TODOS os filmes/séries disponíveis
 * 
 * REGRA SIMPLES: Toda URL que termina com .mp4 é filme ou série
 * 
 * IMPORTANTE: Processa AMBOS os arquivos
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Movie {
  id: string;
  name: string;
  url: string;
  logo?: string;
  category: string;
  type: 'movie' | 'series';
  isAdult?: boolean;
}

// ============================================================
// CATEGORIAS ADULTAS (requerem desbloqueio)
// ============================================================
const ADULT_KEYWORDS = [
  'ADULTOS',
  '[HOT]',
  '❌❤️',
  'XXX',
  '[Adulto]',
];

// ============================================================
// INDICADORES DE QUE É SÉRIE (não filme)
// ============================================================
const SERIES_CATEGORY_KEYWORDS = [
  'series |',
  'series|',
  'séries',
  'novelas',
  'doramas',
  'dorama',
  '24h animes',
  '24h desenhos',
  '24h series',
  'programas de tv',
  'stand up',
];

// Padrões de episódio no nome
const EPISODE_PATTERNS = [
  /S\d+\s*E\d+/i,           // S01E05
  /T\d+\s*E\d+/i,           // T01E05
  /\d+\s*x\s*\d+/i,         // 1x05
  /Temporada\s*\d+/i,       // Temporada 1
  /Season\s*\d+/i,          // Season 1
  /Temp\.?\s*\d+/i,         // Temp 1
  /\[L\]\s*\(\d{4}\)\s*S\d+/i,  // [L] (2017) S01
];

// ============================================================
// FUNÇÕES AUXILIARES
// ============================================================

function generateId(name: string, url: string): string {
  // Usa parte da URL para garantir unicidade
  const urlHash = url.split('/').slice(-2).join('-').replace(/\.[^.]+$/, '');
  const nameSlug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 60);
  return `${nameSlug}-${urlHash}`.substring(0, 100);
}

function isMovieOrSeriesURL(url: string): boolean {
  // REGRA SIMPLES: URLs .mp4 são filmes/séries
  const lowerUrl = url.toLowerCase();
  return lowerUrl.endsWith('.mp4') || lowerUrl.endsWith('.mkv') || lowerUrl.endsWith('.avi');
}

function isAdultContent(category: string, name: string): boolean {
  const combined = (category + ' ' + name).toUpperCase();
  return ADULT_KEYWORDS.some(keyword => 
    combined.includes(keyword.toUpperCase())
  );
}

function isSeriesContent(category: string, name: string): boolean {
  const lowerCat = category.toLowerCase();
  
  // Verifica categoria
  if (SERIES_CATEGORY_KEYWORDS.some(kw => lowerCat.includes(kw))) {
    return true;
  }
  
  // Verifica padrões de episódio no nome
  return EPISODE_PATTERNS.some(pattern => pattern.test(name));
}

function cleanName(name: string): string {
  return name
    .replace(/^\d+\s*[-–]\s*/, '')     // Remove número no início
    .replace(/\s*\[L\]\s*$/i, '')      // Remove [L] do final
    .replace(/\s*\(DUB\)\s*/gi, ' ')   // Remove (DUB)
    .replace(/\s*\(LEG\)\s*/gi, ' ')   // Remove (LEG)
    .replace(/\s+/g, ' ')              // Normaliza espaços
    .trim();
}

function normalizeCategory(category: string): string {
  let cat = category.trim();
  
  // Remove emojis de marcação no início
  cat = cat.replace(/^[⏺️♦️⏲️⛄⛰️✝️⚽⭐🎬📺💥🎨🗺️😂🔫📚🎭👨‍👩‍👧‍👦🚀🤠⚔️📝🇧🇷💕🔍👻☠✔️]+\s*/g, '');
  
  // Normaliza categorias de séries
  if (cat.toLowerCase().startsWith('series |')) {
    const platform = cat.replace(/series \|/i, '').trim();
    cat = platform;
  }
  if (cat.toLowerCase().startsWith('series|')) {
    const platform = cat.replace(/series\|/i, '').trim();
    cat = platform;
  }
  
  // Normaliza categorias OND
  if (cat.toUpperCase().startsWith('OND /')) {
    const genre = cat.replace(/OND \//i, '').replace(/-/g, '').trim();
    cat = genre;
  }
  
  // Normaliza coletâneas
  if (cat.toUpperCase().startsWith('COLETÂNEA:')) {
    const name = cat.replace(/COLETÂNEA:/i, '').trim().toUpperCase();
    return `🎬 Coleção ${name}`;
  }
  
  // Limpa e normaliza o texto
  const cleanCat = cat
    .replace(/✔️/g, '')
    .replace(/⭐/g, '')
    .replace(/☠/g, '')
    .replace(/⚔/g, '')
    .replace(/\|/g, '')
    .trim();
  
  // Mapeamento de normalização (chave em lowercase -> valor normalizado)
  // Agrupa variações do mesmo nome
  const categoryMappings: Record<string, string> = {
    // === GÊNEROS DE FILMES ===
    'ação': '🎬 Ação',
    'acao': '🎬 Ação',
    'animação': '🎬 Animação',
    'animacao': '🎬 Animação',
    'aventura': '🎬 Aventura',
    'comédia': '🎬 Comédia',
    'comedia': '🎬 Comédia',
    'crime': '🎬 Crime',
    'documentário': '🎬 Documentário',
    'documentario': '🎬 Documentário',
    'docu': '🎬 Documentário',
    'drama': '🎬 Drama',
    'família': '🎬 Família',
    'familia': '🎬 Família',
    'fantasia': '🎬 Fantasia',
    'fantasia & ficção': '🎬 Fantasia',
    'faroeste': '🎬 Faroeste',
    'ficção científica': '🎬 Ficção Científica',
    'ficcao cientifica': '🎬 Ficção Científica',
    'guerra': '🎬 Guerra',
    'infantil': '🎬 Infantil',
    'especial infantil': '🎬 Infantil',
    'legendados': '🎬 Legendados',
    'nacionais': '🎬 Nacionais',
    'religiosos': '🎬 Religiosos',
    'romance': '🎬 Romance',
    'suspense': '🎬 Suspense',
    'terror': '🎬 Terror',
    'esportes': '🎬 Esportes',
    
    // === ESPECIAIS ===
    'lançamentos': '🎬 Lançamentos',
    'lancamentos': '🎬 Lançamentos',
    'lançamentos 2026': '🎬 Lançamentos',
    'lancamentos 2026': '🎬 Lançamentos',
    'cinema': '🎬 Cinema',
    'oscar 2025': '🎬 Oscar 2025',
    'sugestão da semana': '⭐ Sugestão da Semana',
    'sugestao da semana': '⭐ Sugestão da Semana',
    '4k uhd': '🎬 4K UHD',
    'uhd 4k': '🎬 4K UHD',
    'marvel ucm': '🎬 Marvel UCM',
    'marvel | ucm': '🎬 Marvel UCM',
    'dublagem não oficial': '🎬 Dublagem Não Oficial',
    'dublagem nao oficial': '🎬 Dublagem Não Oficial',
    'outras produtoras': '🎬 Outras Produtoras',
    
    // === PLATAFORMAS DE STREAMING ===
    'netflix': '📺 Netflix',
    'amazon prime video': '📺 Prime Video',
    'prime video': '📺 Prime Video',
    'disney+': '📺 Disney+',
    'disney plus': '📺 Disney+',
    'max': '📺 Max',
    'hbo': '📺 Max',
    'hbo max': '📺 Max',
    'globoplay': '📺 Globoplay',
    'paramount+': '📺 Paramount+',
    'paramount': '📺 Paramount+',
    'apple tv+': '📺 Apple TV+',
    'apple tv plus': '📺 Apple TV+',
    'appletv+': '📺 Apple TV+',
    'star+': '📺 Star+',
    'star plus': '📺 Star+',
    'crunchyroll': '📺 Crunchyroll',
    'funimation': '📺 Funimation',
    'funimation now': '📺 Funimation',
    'amc plus': '📺 AMC Plus',
    'amc+': '📺 AMC Plus',
    'lionsgate': '📺 Lionsgate',
    'lionsgate+': '📺 Lionsgate',
    'claro video': '📺 Claro Video',
    'clarovideo': '📺 Claro Video',
    'play plus': '📺 Play Plus',
    'playplus': '📺 Play Plus',
    'plutotv': '📺 PlutoTV',
    'pluto tv': '📺 PlutoTV',
    'sbt': '📺 SBT',
    'sbt+': '📺 SBT',
    'directv': '📺 DirecTV',
    'direct tv': '📺 DirecTV',
    'discovery+': '📺 Discovery+',
    'discovery plus': '📺 Discovery+',
    'brasil paralelo': '📺 Brasil Paralelo',
    'univer': '📺 Univer',
    'univer video': '📺 Univer',
    
    // === SÉRIES ===
    'novelas': '📺 Novelas',
    'novelas turcas': '📺 Novelas Turcas',
    'turcas': '📺 Novelas Turcas',
    'doramas': '📺 Doramas',
    'dorama': '📺 Doramas',
    'legendadas': '📺 Legendadas',
    'programas de tv': '📺 Programas de TV',
    'shows': '📺 Shows',
    'stand up comedy': '📺 Stand Up Comedy',
    'stand up': '📺 Stand Up Comedy',
    'standup': '📺 Stand Up Comedy',
    
    // === ADULTOS ===
    '[hot] adultos ❌❤️': '🔞 Adultos',
    '[hot] adultos': '🔞 Adultos',
    'adultos': '🔞 Adultos',
    '[hot] adultos ❌❤️ [bella da semana]': '🔞 Adultos - Bella da Semana',
    '[hot] adultos ❌❤️ [legendado]': '🔞 Adultos - Legendado',
  };
  
  // Tenta encontrar no mapeamento (case-insensitive)
  const lowerClean = cleanCat.toLowerCase();
  if (categoryMappings[lowerClean]) {
    return categoryMappings[lowerClean];
  }
  
  // Tenta match parcial para plataformas
  const platformPatterns: [RegExp, string][] = [
    [/netflix/i, '📺 Netflix'],
    [/prime\s*video/i, '📺 Prime Video'],
    [/amazon/i, '📺 Prime Video'],
    [/disney\s*\+/i, '📺 Disney+'],
    [/disney\s*plus/i, '📺 Disney+'],
    [/^max$/i, '📺 Max'],
    [/hbo/i, '📺 Max'],
    [/globoplay/i, '📺 Globoplay'],
    [/paramount/i, '📺 Paramount+'],
    [/apple\s*tv/i, '📺 Apple TV+'],
    [/star\s*\+/i, '📺 Star+'],
    [/star\s*plus/i, '📺 Star+'],
    [/crunchyroll/i, '📺 Crunchyroll'],
    [/funimation/i, '📺 Funimation'],
    [/discovery/i, '📺 Discovery+'],
    [/directv/i, '📺 DirecTV'],
    [/novelas?\s*turcas?/i, '📺 Novelas Turcas'],
    [/turcas?$/i, '📺 Novelas Turcas'],
    [/doramas?/i, '📺 Doramas'],
  ];
  
  for (const [pattern, normalized] of platformPatterns) {
    if (pattern.test(cleanCat)) {
      return normalized;
    }
  }
  
  // Categorias 24H
  if (cleanCat.toLowerCase().includes('24h')) {
    if (cleanCat.toLowerCase().includes('anime')) return '📺 24H Animes';
    if (cleanCat.toLowerCase().includes('desenho')) return '📺 24H Desenhos';
    if (cleanCat.toLowerCase().includes('serie') || cleanCat.toLowerCase().includes('programa')) return '📺 24H Séries';
    if (cleanCat.toLowerCase().includes('pegadinha')) return '📺 24H Pegadinhas';
    return `📺 ${cleanCat}`;
  }
  
  // Se não encontrou, usa o nome original com emoji apropriado
  // Detecta se é série ou filme baseado em keywords
  const seriesKeywords = ['series', 'série', 'novela', 'programa', 'show', 'dorama', 'anime'];
  const isSeriesCategory = seriesKeywords.some(kw => cleanCat.toLowerCase().includes(kw));
  
  const emoji = isSeriesCategory ? '📺' : '🎬';
  
  // Capitaliza primeira letra de cada palavra
  const titleCase = cleanCat
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  
  return `${emoji} ${titleCase}`;
}

// ============================================================
// PARSER PRINCIPAL
// ============================================================

async function parseM3U8File(filePath: string): Promise<Movie[]> {
  console.log(`\n📂 Processando: ${filePath}`);
  
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  
  console.log(`   Total de linhas: ${lines.length}`);
  
  const movies: Movie[] = [];
  const seenUrls = new Set<string>();
  
  let currentInfo: {
    name: string;
    category: string;
    logo?: string;
  } | null = null;
  
  let skippedItems = 0;
  let addedItems = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    
    if (trimmedLine.startsWith('#EXTINF:')) {
      // Parse da linha de informação
      const groupMatch = trimmedLine.match(/group-title="([^"]+)"/);
      const logoMatch = trimmedLine.match(/tvg-logo="([^"]+)"/);
      const nameMatch = trimmedLine.match(/,(.+)$/);
      
      if (nameMatch && groupMatch) {
        const category = groupMatch[1];
        const name = cleanName(nameMatch[1]);
        
        currentInfo = {
          name,
          category,
          logo: logoMatch ? logoMatch[1] : undefined,
        };
      } else {
        currentInfo = null;
      }
    } 
    else if (currentInfo) {
      // Linha após #EXTINF - pode conter:
      // 1. URL pura: "http://..."
      // 2. Nome continuado + espaços + URL: "S01E01                    http://..."
      // 3. Nome continuado (sem URL ainda)
      
      let url = '';
      let nameContinuation = '';
      
      // Procura por URL na linha (pode estar após espaços)
      const urlMatch = line.match(/(https?:\/\/[^\s]+)/);
      
      if (urlMatch) {
        url = urlMatch[1].trim();
        
        // Se há texto antes da URL, é continuação do nome
        const beforeUrl = line.substring(0, line.indexOf(urlMatch[1])).trim();
        if (beforeUrl && !beforeUrl.startsWith('#')) {
          nameContinuation = beforeUrl;
        }
      } else if (trimmedLine.startsWith('http')) {
        url = trimmedLine;
      }
      
      // Se encontrou URL
      if (url) {
        // Combina nome com continuação (se houver)
        let fullName = currentInfo.name;
        if (nameContinuation) {
          fullName = cleanName(currentInfo.name + ' ' + nameContinuation);
        }
        
        // REGRA SIMPLES: Apenas URLs de vídeo (.mp4, .mkv, .avi) são aceitas
        if (!isMovieOrSeriesURL(url)) {
          skippedItems++;
          currentInfo = null;
          continue;
        }
        
        // Evita duplicatas por URL
        if (!seenUrls.has(url)) {
          seenUrls.add(url);
          
          const isAdult = isAdultContent(currentInfo.category, fullName);
          const isSeries = isSeriesContent(currentInfo.category, fullName);
          
          movies.push({
            id: generateId(fullName, url),
            name: fullName,
            url,
            logo: currentInfo.logo,
            category: normalizeCategory(currentInfo.category),
            type: isSeries ? 'series' : 'movie',
            isAdult,
          });
          
          addedItems++;
        }
        
        currentInfo = null;
      }
    }
    
    // Log de progresso
    if ((i + 1) % 50000 === 0) {
      console.log(`   Processado ${i + 1}/${lines.length} linhas...`);
    }
  }
  
  console.log(`   ✅ Adicionados: ${addedItems} items`);
  console.log(`   ⏭️ Ignorados (não .mp4): ${skippedItems}`);
  
  return movies;
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  const assetsDir = path.join(__dirname, '../src/assets');
  const outputPath = path.join(__dirname, '../src/data/movies.ts');
  const chunksDir = path.join(__dirname, '../public/data');
  
  console.log('🎬 Parser de Filmes/Séries - COMPLETO');
  console.log('='.repeat(60));
  console.log('Processando TODOS os arquivos M3U8...');
  
  // Processar ambos os arquivos
  const files = ['ListaBR01.m3u8', 'ListaBR02.m3u8'];
  let allMovies: Movie[] = [];
  
  for (const file of files) {
    const filePath = path.join(assetsDir, file);
    if (fs.existsSync(filePath)) {
      const movies = await parseM3U8File(filePath);
      allMovies = allMovies.concat(movies);
    } else {
      console.log(`⚠️ Arquivo não encontrado: ${file}`);
    }
  }
  
  // Remover duplicatas por URL (manter o primeiro encontrado)
  const uniqueMovies: Movie[] = [];
  const seenUrls = new Set<string>();
  
  for (const movie of allMovies) {
    if (!seenUrls.has(movie.url)) {
      seenUrls.add(movie.url);
      uniqueMovies.push(movie);
    }
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 TOTAL GERAL: ${uniqueMovies.length} items únicos`);
  
  // Estatísticas
  const categories = new Map<string, number>();
  let adultCount = 0;
  let seriesCount = 0;
  let movieCount = 0;
  
  uniqueMovies.forEach(m => {
    categories.set(m.category, (categories.get(m.category) || 0) + 1);
    if (m.isAdult) adultCount++;
    if (m.type === 'series') seriesCount++;
    else movieCount++;
  });
  
  console.log(`   🎬 Filmes: ${movieCount}`);
  console.log(`   📺 Séries/Episódios: ${seriesCount}`);
  console.log(`   🔞 Adultos: ${adultCount}`);
  console.log(`   📁 Categorias: ${categories.size}`);
  
  // Criar diretório para chunks se não existir
  if (!fs.existsSync(chunksDir)) {
    fs.mkdirSync(chunksDir, { recursive: true });
  }
  
  // Limpar arquivos antigos
  const existingFiles = fs.readdirSync(chunksDir).filter(f => f.endsWith('.json'));
  existingFiles.forEach(f => fs.unlinkSync(path.join(chunksDir, f)));
  
  // Agrupar por categoria e criar chunks JSON
  const categoryData = new Map<string, Movie[]>();
  uniqueMovies.forEach(m => {
    if (!categoryData.has(m.category)) {
      categoryData.set(m.category, []);
    }
    categoryData.get(m.category)!.push(m);
  });
  
  // Salvar cada categoria como chunk JSON separado
  const categoryIndex: { name: string; file: string; count: number; isAdult: boolean }[] = [];
  
  categoryData.forEach((movies, category) => {
    const fileName = category
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50) + '.json';
    
    const isAdult = movies.some(m => m.isAdult);
    
    fs.writeFileSync(
      path.join(chunksDir, fileName),
      JSON.stringify(movies)
    );
    
    categoryIndex.push({
      name: category,
      file: fileName,
      count: movies.length,
      isAdult
    });
  });
  
  // Ordenar categorias (prioridade para lançamentos e principais plataformas)
  categoryIndex.sort((a, b) => {
    const priority = ['Lançamentos', 'Sugestão', 'Cinema', 'Netflix', 'Prime', 'Disney', 'Max', 'HBO', 'Globoplay'];
    
    const aHasPriority = priority.findIndex(p => a.name.includes(p));
    const bHasPriority = priority.findIndex(p => b.name.includes(p));
    
    if (aHasPriority >= 0 && bHasPriority < 0) return -1;
    if (bHasPriority >= 0 && aHasPriority < 0) return 1;
    if (aHasPriority >= 0 && bHasPriority >= 0) return aHasPriority - bHasPriority;
    
    if (a.isAdult && !b.isAdult) return 1;
    if (b.isAdult && !a.isAdult) return -1;
    
    return a.name.localeCompare(b.name, 'pt-BR');
  });
  
  // Salvar índice de categorias
  fs.writeFileSync(
    path.join(chunksDir, 'categories.json'),
    JSON.stringify(categoryIndex, null, 2)
  );
  
  console.log(`\n📦 Chunks criados: ${categoryIndex.length} arquivos em /public/data/`);
  
  // Criar dados iniciais (primeiras 10 categorias não-adultas para carregamento rápido)
  const initialCategories = categoryIndex.filter(c => !c.isAdult).slice(0, 10);
  const initialMovies: Movie[] = [];
  
  initialCategories.forEach(cat => {
    const movies = categoryData.get(cat.name) || [];
    initialMovies.push(...movies.slice(0, 100)); // 100 por categoria inicial
  });
  
  // Lista de categorias adultas para referência
  const adultCategoryNames = categoryIndex.filter(c => c.isAdult).map(c => c.name);
  
  // Gerar arquivo TypeScript
  const output = `// Auto-generated file - Do not edit manually
// Generated at: ${new Date().toISOString()}
// Source: ListaBR01.m3u8 + ListaBR02.m3u8
// Total: ${uniqueMovies.length} items (lazy loaded)

import type { Movie } from '../types/movie';

// Interface estendida com suporte a adulto
export interface MovieWithAdult extends Movie {
  isAdult?: boolean;
}

// Interface para índice de categorias
export interface CategoryIndex {
  name: string;
  file: string;
  count: number;
  isAdult: boolean;
}

// Categorias adultas para filtragem
export const ADULT_CATEGORIES: string[] = ${JSON.stringify(adultCategoryNames)};

// Índice de categorias (carregado estaticamente para performance)
export const categoryIndex: CategoryIndex[] = ${JSON.stringify(categoryIndex, null, 2)};

// Dados iniciais para carregamento rápido (${initialMovies.length} items)
// @ts-ignore
export const initialMoviesData: MovieWithAdult[] = ${JSON.stringify(initialMovies)};

// Lista de categorias ordenadas
export const movieCategories: string[] = categoryIndex.map(c => c.name);

// Categorias não-adultas
export const safeCategories: string[] = categoryIndex.filter(c => !c.isAdult).map(c => c.name);

// Cache de dados carregados
const loadedCategories = new Map<string, MovieWithAdult[]>();

// Inicializa cache com dados iniciais
const initialCatNames = ${JSON.stringify(initialCategories.map(c => c.name))};
initialCatNames.forEach((catName: string) => {
  const movies = initialMoviesData.filter(m => m.category === catName);
  if (movies.length > 0) {
    loadedCategories.set(catName, movies);
  }
});

// Função para carregar categoria sob demanda
export async function loadCategory(categoryName: string): Promise<MovieWithAdult[]> {
  // Retorna do cache se já carregado
  if (loadedCategories.has(categoryName)) {
    return loadedCategories.get(categoryName)!;
  }
  
  // Encontra o arquivo da categoria
  const cat = categoryIndex.find(c => c.name === categoryName);
  if (!cat) return [];
  
  try {
    const response = await fetch(\`/data/\${cat.file}\`);
    if (!response.ok) throw new Error('Failed to fetch');
    const movies = await response.json();
    loadedCategories.set(categoryName, movies);
    return movies;
  } catch (error) {
    console.error(\`Erro ao carregar categoria \${categoryName}:\`, error);
    return [];
  }
}

// Função para carregar múltiplas categorias
export async function loadCategories(categoryNames: string[]): Promise<Map<string, MovieWithAdult[]>> {
  const results = new Map<string, MovieWithAdult[]>();
  
  await Promise.all(
    categoryNames.map(async (name) => {
      const movies = await loadCategory(name);
      results.set(name, movies);
    })
  );
  
  return results;
}

// Função para buscar em todas as categorias (carrega sob demanda)
export async function searchAllMovies(query: string, isAdultUnlocked: boolean): Promise<MovieWithAdult[]> {
  const results: MovieWithAdult[] = [];
  const categoriesToSearch = isAdultUnlocked ? categoryIndex : categoryIndex.filter(c => !c.isAdult);
  const normalizedQuery = query.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
  
  // Busca em paralelo em chunks de 5 categorias por vez
  const chunkSize = 5;
  for (let i = 0; i < categoriesToSearch.length; i += chunkSize) {
    const chunk = categoriesToSearch.slice(i, i + chunkSize);
    const chunkResults = await Promise.all(
      chunk.map(async (cat) => {
        const movies = await loadCategory(cat.name);
        return movies.filter(m => {
          const normalizedName = m.name.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
          return normalizedName.includes(normalizedQuery);
        });
      })
    );
    results.push(...chunkResults.flat());
    
    // Se já tem muitos resultados, para
    if (results.length >= 200) break;
  }
  
  return results;
}

// Getter para todos os dados carregados (para compatibilidade)
export function getLoadedMovies(): MovieWithAdult[] {
  const all: MovieWithAdult[] = [];
  loadedCategories.forEach(movies => all.push(...movies));
  return all;
}

// Para compatibilidade com código existente
export const moviesData = initialMoviesData;
`;

  fs.writeFileSync(outputPath, output);
  
  console.log(`\n💾 Arquivo principal: ${outputPath}`);
  console.log(`   Dados iniciais: ${initialMovies.length} items`);
  
  // Mostrar top categorias
  console.log('\n📁 Top 25 categorias por quantidade:');
  const sortedCategories = [...categories.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25);
  
  sortedCategories.forEach(([cat, count], i) => {
    console.log(`   ${(i + 1).toString().padStart(2)}. ${cat}: ${count} items`);
  });
  
  console.log(`\n${'='.repeat(60)}`);
  console.log('✅ Processamento completo!');
}

main().catch(console.error);
