import type { Program, ChannelEPG, CurrentProgram } from '../types/epg';

// ============================================================================
// EPG Service - Scraping direto do meuguia.tv
// ============================================================================
// Sistema com:
// - Cache inteligente persistente (localStorage)
// - Atualização mensal ou quando programação acabar
// - Múltiplos proxies CORS com fallback automático
// - Retry com backoff exponencial
// ============================================================================

// ============================================================================
// CONFIGURAÇÕES DE CACHE INTELIGENTE
// ============================================================================
const CACHE_KEY = 'epg_cache_v2';
const CACHE_META_KEY = 'epg_cache_meta_v2';
const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias em ms
const MIN_FUTURE_PROGRAMS = 5; // Mínimo de programas futuros antes de recarregar

// Cache em memória
const epgCache: Map<string, Program[]> = new Map();
const lastFetch: Map<string, number> = new Map();
const pendingFetches: Map<string, Promise<Program[]>> = new Map();

// Listeners para atualização de EPG
type EPGListener = (channelId: string, programs: Program[]) => void;
const listeners: Set<EPGListener> = new Set();

// ============================================================================
// SISTEMA DE MÚLTIPLOS PROXIES CORS
// ============================================================================
// Lista de proxies públicos para contornar CORS
// O sistema rotaciona automaticamente entre eles em caso de falha
// ============================================================================
const CORS_PROXIES = [
  // Proxy 1: AllOrigins - Mais estável, mas tem rate limit
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  
  // Proxy 2: CorsProxy.io - Bom fallback, rápido
  (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  
  // Proxy 3: CodeTabs - Alternativa confiável
  (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  
  // Proxy 4: Cors.sh - Requer header especial às vezes
  (url: string) => `https://proxy.cors.sh/${url}`,
  
  // Proxy 5: ThingProxy - Último recurso
  (url: string) => `https://thingproxy.freeboard.io/fetch/${url}`,
];

// Índice do proxy atual (rotaciona entre eles para balanceamento)
let currentProxyIndex = 0;

// Controle de retry com backoff
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 segundo inicial

// ============================================================================
// MAPEAMENTO DE CANAIS
// ============================================================================
// FONTES DE EPG:
// - meuguia.tv: fonte principal para maioria dos canais
// - guiadetv.com: fonte alternativa para canais HBO, CNN, Cartoonito, etc.
// ============================================================================

// Mapeamento para guiadetv.com (fonte alternativa)
// Canais que não funcionam no meuguia.tv mas funcionam no guiadetv.com
const channelToGuiaDeTvSlug: Record<string, string> = {
  // HBO
  'hbo-pop': 'hbo-pop',
  'hbo-xtreme': 'hbo-xtreme',
  'hbo-mundi': 'hbo-mundi',
  
  // Documentários
  'history2': 'history-2',
  'food-network': 'food-network',
  'hgtv': 'hgtv',
  
  // Notícias
  'cnn-brasil': 'cnn-brasil',
  
  // Infantil
  'cartoonito': 'cartoonito',
  'gloobinho': 'gloobinho',
  
  // Filmes
  'curta': 'curta',
  
  // Esportes - Premiere
  'premiere2': 'premiere-2',
  'premiere3': 'premiere-3',
  'premiere4': 'premiere-4',
  
  // adult-swim não tem EPG em nenhuma fonte
};

// Mapeamento para meuguia.tv (fonte principal)
const channelToMeuGuiaCode: Record<string, string> = {
  // Telecine (6 canais)
  'telecine-action': 'TC2',
  'telecine-premium': 'TC1',
  'telecine-pipoca': 'TC4',
  'telecine-cult': 'TC5',
  'telecine-fun': 'TC6',
  'telecine-touch': 'TC3',
  
  // HBO (7 canais)
  'hbo': 'HBO',
  'hbo2': 'HB2',
  'hbo-family': 'HFA',
  'hbo-plus': 'HPL',
  'hbo-pop': 'HPO', // Usa guiadetv.com como fonte
  'hbo-xtreme': 'HXT', // Usa guiadetv.com como fonte
  'hbo-mundi': 'HMU', // Usa guiadetv.com como fonte
  
  // Globo (5 canais)
  'globo-sp': 'GRD',
  'globo-rj': 'GRD',
  'globo-mg': 'GRD',
  'globo-rs': 'GRD',
  'globo-news': 'GLN',
  
  // SporTV (3 canais)
  'sportv': 'SPO',
  'sportv2': 'SP2',
  'sportv3': 'SP3',
  
  // ESPN (5 canais)
  'espn': 'ESP',
  'espn2': 'ES2',
  'espn3': 'ES3',
  'espn4': 'ES4',
  'espn5': 'ES5',
  
  // TV Aberta (8 canais)
  'sbt': 'SBT',
  'band': 'BAN',
  'record': 'REC',
  'rede-tv': 'RTV',
  'tv-brasil': 'TED',
  'aparecida': 'TAP',
  'cultura': 'CUL',
  'tv-gazeta': 'GAZ',
  
  // Notícias (3 canais)
  'band-news': 'NEW',
  'record-news': 'RCN',
  'cnn-brasil': 'CNB', // Usa guiadetv.com como fonte
  
  // Infantil (5 canais - adult-swim removido pois não tem EPG em nenhuma fonte)
  'cartoon-network': 'CAR',
  'discovery-kids': 'DIK',
  'gloob': 'GOB',
  'cartoonito': 'CTO', // Usa guiadetv.com como fonte
  'gloobinho': 'GBI', // Usa guiadetv.com como fonte
  
  // Documentários (11 canais)
  'discovery': 'DIS',
  'discovery-turbo': 'DTU',
  'discovery-world': 'DIW',
  'discovery-science': 'DSC',
  'discovery-hh': 'HEA',
  'animal-planet': 'APL',
  'history': 'HIS',
  'history2': 'H2H', // Usa guiadetv.com como fonte
  'tlc': 'TRV',
  'food-network': 'FNT', // Usa guiadetv.com como fonte
  'hgtv': 'HGT', // Usa guiadetv.com como fonte
  
  // Séries (7 canais)
  'warner': 'WBT',
  'tnt': 'TNT',
  'tnt-series': 'TNS',
  'axn': 'AXN',
  'sony': 'SET',
  'universal-tv': 'USA',
  'ae': 'MDO',
  
  // Filmes (7 canais)
  'amc': 'MGM',
  'tcm': 'TCM',
  'space': 'SPA',
  'cinemax': 'MNX',
  'megapix': 'MPX',
  'studio-universal': 'HAL',
  'curta': 'CUR', // Usa guiadetv.com como fonte
  
  // Entretenimento (6 canais)
  'multishow': 'MSW',
  'bis': 'MSH',
  'viva': 'VIV',
  'off': 'OFF',
  'gnt': 'GNT',
  'arte1': 'BQ5',
  
  // Esportes (6 canais)
  'premiere': '121',
  'combate': '135',
  'band-sports': 'BSP',
  'premiere2': 'PR2', // Usa guiadetv.com como fonte
  'premiere3': 'PR3', // Usa guiadetv.com como fonte
  'premiere4': 'PR4', // Usa guiadetv.com como fonte
};

// ============================================================================
// FUNÇÕES DE CACHE PERSISTENTE (localStorage)
// ============================================================================

interface CacheMeta {
  lastFullLoad: number;
  channelLastUpdate: Record<string, number>;
}

/**
 * Carrega cache do localStorage para memória
 */
function loadCacheFromStorage(): void {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    const meta = localStorage.getItem(CACHE_META_KEY);
    
    if (cached && meta) {
      const data = JSON.parse(cached) as Record<string, Array<{
        id: string;
        title: string;
        description: string;
        category: string;
        startTime: string;
        endTime: string;
      }>>;
      
      const metaData = JSON.parse(meta) as CacheMeta;
      
      // Restaura cache em memória com conversão de datas
      Object.entries(data).forEach(([channelId, programs]) => {
        const parsed = programs.map(p => ({
          ...p,
          startTime: new Date(p.startTime),
          endTime: new Date(p.endTime),
        }));
        epgCache.set(channelId, parsed);
        lastFetch.set(channelId, metaData.channelLastUpdate[channelId] || 0);
      });
      
      console.log(`[EPG Cache] Carregado ${epgCache.size} canais do localStorage`);
    }
  } catch (e) {
    console.error('[EPG Cache] Erro ao carregar cache:', e);
  }
}

/**
 * Salva cache da memória para localStorage
 */
function saveCacheToStorage(): void {
  try {
    const data: Record<string, Program[]> = {};
    const metaData: CacheMeta = {
      lastFullLoad: Date.now(),
      channelLastUpdate: {},
    };
    
    epgCache.forEach((programs, channelId) => {
      data[channelId] = programs;
      metaData.channelLastUpdate[channelId] = lastFetch.get(channelId) || Date.now();
    });
    
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    localStorage.setItem(CACHE_META_KEY, JSON.stringify(metaData));
    
    console.log(`[EPG Cache] Salvo ${epgCache.size} canais no localStorage`);
  } catch (e) {
    console.error('[EPG Cache] Erro ao salvar cache:', e);
  }
}

/**
 * Verifica se o cache de um canal precisa ser atualizado
 * Retorna true se:
 * 1. Não tem cache
 * 2. Cache tem mais de 1 mês
 * 3. Programação está acabando (menos de MIN_FUTURE_PROGRAMS programas futuros)
 */
function needsUpdate(channelId: string): boolean {
  const programs = epgCache.get(channelId);
  const fetchTime = lastFetch.get(channelId) || 0;
  const now = Date.now();
  
  // Sem cache
  if (!programs || programs.length === 0) {
    console.log(`[EPG Cache] ${channelId}: Sem cache, precisa carregar`);
    return true;
  }
  
  // Cache muito antigo (mais de 1 mês)
  if (now - fetchTime > ONE_MONTH_MS) {
    console.log(`[EPG Cache] ${channelId}: Cache expirado (${Math.floor((now - fetchTime) / (24 * 60 * 60 * 1000))} dias)`);
    return true;
  }
  
  // Verifica quantos programas futuros ainda tem
  const nowDate = new Date();
  const futurePrograms = programs.filter(p => p.endTime > nowDate);
  
  if (futurePrograms.length < MIN_FUTURE_PROGRAMS) {
    console.log(`[EPG Cache] ${channelId}: Poucos programas futuros (${futurePrograms.length}), precisa atualizar`);
    return true;
  }
  
  return false;
}

// ============================================================================
// LISTENERS
// ============================================================================

/**
 * Registra listener para atualizações de EPG
 */
export function onEPGUpdate(listener: EPGListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Notifica listeners
 */
function notifyListeners(channelId: string, programs: Program[]): void {
  listeners.forEach(listener => {
    try {
      listener(channelId, programs);
    } catch (e) {
      console.error('Erro em listener EPG:', e);
    }
  });
}

// ============================================================================
// PARSING DE HTML
// ============================================================================

/**
 * Parse HTML do meuguia.tv para extrair programas
 */
function parseHTMLPrograms(html: string, channelId: string): Program[] {
  const programs: Program[] = [];
  
  try {
    const today = new Date();
    const currentYear = today.getFullYear();
    
    // Remove templates ERB que não foram processados
    const cleanHtml = html.replace(/<li class="subheader[^"]*"><%=[^>]+%><\/li>/gi, '');
    
    // Regex para capturar cada programa individualmente
    const programRegex = /<div class=['"]lileft time['"]>\s*(\d{1,2}:\d{2})\s*<\/div>[\s\S]*?<h2>([^<]+)<\/h2>[\s\S]*?<h3>([^<]*)<\/h3>/gi;
    
    // Extrai datas dos cabeçalhos reais (com dia/mês)
    const dateHeaders: { index: number; date: Date }[] = [];
    const headerRegex = /<li class="subheader[^"]*">[^<]*?(\d{1,2})\/(\d{1,2})[^<]*<\/li>/gi;
    
    let headerMatch;
    while ((headerMatch = headerRegex.exec(cleanHtml)) !== null) {
      const day = parseInt(headerMatch[1]);
      const month = parseInt(headerMatch[2]) - 1;
      let date = new Date(currentYear, month, day, 0, 0, 0, 0);
      
      if (month < today.getMonth() - 6) {
        date = new Date(currentYear + 1, month, day, 0, 0, 0, 0);
      }
      
      dateHeaders.push({ index: headerMatch.index, date });
    }
    
    if (dateHeaders.length === 0) {
      dateHeaders.push({ index: 0, date: new Date(today.getFullYear(), today.getMonth(), today.getDate()) });
    }
    
    let programMatch;
    let lastHour = -1;
    let currentDateIndex = 0;
    
    while ((programMatch = programRegex.exec(cleanHtml)) !== null) {
      const timeStr = programMatch[1];
      const title = programMatch[2].trim();
      const category = programMatch[3].trim();
      
      while (currentDateIndex < dateHeaders.length - 1 && 
             programMatch.index > dateHeaders[currentDateIndex + 1].index) {
        currentDateIndex++;
        lastHour = -1;
      }
      
      let programDate = new Date(dateHeaders[currentDateIndex].date);
      
      const timeParts = timeStr.split(':');
      const hours = parseInt(timeParts[0]);
      const minutes = parseInt(timeParts[1]);
      
      if (lastHour !== -1 && hours < lastHour - 6) {
        programDate = new Date(programDate.getTime() + 24 * 60 * 60 * 1000);
      }
      lastHour = hours;
      
      const startTime = new Date(programDate);
      startTime.setHours(hours, minutes, 0, 0);
      
      const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
      
      programs.push({
        id: `${channelId}-${startTime.getTime()}`,
        title: decodeHTMLEntities(title),
        description: '',
        category: decodeHTMLEntities(category),
        startTime,
        endTime,
      });
    }
    
    programs.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
    
    for (let i = 0; i < programs.length - 1; i++) {
      programs[i].endTime = programs[i + 1].startTime;
    }
    
    console.log(`[EPG] ${channelId}: ${programs.length} programas parseados`);
    
  } catch (e) {
    console.error('[EPG] Erro parsing:', e);
  }
  
  return programs;
}

function decodeHTMLEntities(text: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
    '&#39;': "'", '&apos;': "'", '&nbsp;': ' ',
    '&eacute;': 'é', '&aacute;': 'á', '&iacute;': 'í',
    '&oacute;': 'ó', '&uacute;': 'ú', '&atilde;': 'ã',
    '&otilde;': 'õ', '&ccedil;': 'ç', '&ndash;': '–', '&mdash;': '—',
  };
  return text.replace(/&[^;]+;/g, m => entities[m] || m);
}

// ============================================================================
// PARSING DE HTML - guiadetv.com (FONTE ALTERNATIVA)
// ============================================================================

/**
 * Parse HTML do guiadetv.com para extrair programas
 * Estrutura: data-dt="YYYY-MM-DD HH:MM:SS-03:00" ... <a href=".../programa/slug">título</a>
 */
function parseGuiaDeTvHTML(html: string, channelId: string): Program[] {
  const programs: Program[] = [];
  
  try {
    // Padrão que captura: data-dt="datetime" ... <a href="programa/slug">título</a>
    const pattern = /data-dt="(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})[^"]*"[\s\S]*?<a[^>]*href="[^"]*programa\/[^"]+\"[^>]*>[\s\S]*?([A-Za-zÀ-ÿ0-9][^<]{2,150})/g;
    
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const datetimeStr = match[1];
      let title = match[2].trim().replace(/\s+/g, ' ');
      
      // Limpa o título (remove caracteres especiais no início/fim)
      title = title.replace(/^[\s\n\r]+|[\s\n\r]+$/g, '');
      
      // Ignora títulos inválidos
      if (!title || title.length < 2 || title.length > 150 || 
          title.includes('{') || title.includes('function')) {
        continue;
      }
      
      // Parse da data/hora: "2026-01-12 10:40:00"
      const [datePart, timePart] = datetimeStr.split(' ');
      const [year, month, day] = datePart.split('-').map(Number);
      const [hours, minutes] = timePart.split(':').map(Number);
      
      const startTime = new Date(year, month - 1, day, hours, minutes, 0, 0);
      const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // 1h default
      
      programs.push({
        id: `${channelId}-${startTime.getTime()}`,
        title: decodeHTMLEntities(title),
        description: '',
        category: '',
        startTime,
        endTime,
      });
    }
    
    // Remove duplicatas (mesmo datetime + título)
    const uniqueMap = new Map<string, Program>();
    programs.forEach(p => {
      const key = `${p.startTime.getTime()}-${p.title}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, p);
      }
    });
    
    const uniquePrograms = Array.from(uniqueMap.values());
    
    // Ordena por horário
    uniquePrograms.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
    
    // Ajusta endTime para ser o startTime do próximo programa
    for (let i = 0; i < uniquePrograms.length - 1; i++) {
      uniquePrograms[i].endTime = uniquePrograms[i + 1].startTime;
    }
    
    console.log(`[EPG GuiaDeTV] ${channelId}: ${uniquePrograms.length} programas parseados`);
    
    return uniquePrograms;
    
  } catch (e) {
    console.error('[EPG GuiaDeTV] Erro parsing:', e);
  }
  
  return programs;
}

// ============================================================================
// SISTEMA DE FETCH COM MÚLTIPLOS PROXIES
// ============================================================================

/**
 * Faz fetch com timeout
 */
async function fetchWithTimeout(url: string, timeoutMs: number = 15000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Tenta buscar usando diferentes proxies CORS com retry e backoff exponencial
 * 
 * Estratégia:
 * 1. Começa pelo último proxy que funcionou (currentProxyIndex)
 * 2. Se falhar, tenta o próximo proxy
 * 3. Se todos falharem, aguarda e tenta novamente (até MAX_RETRIES vezes)
 * 4. Delay aumenta exponencialmente entre retries
 * 
 * @param url - URL para buscar
 * @param channelId - ID do canal (para logs)
 * @param source - 'meuguia' ou 'guiadetv' para validação específica
 */
async function fetchWithProxyFallback(
  url: string, 
  channelId: string, 
  source: 'meuguia' | 'guiadetv' = 'meuguia'
): Promise<string | null> {
  const startProxyIndex = currentProxyIndex;
  
  for (let retry = 0; retry < MAX_RETRIES; retry++) {
    const retryDelay = INITIAL_RETRY_DELAY * Math.pow(2, retry); // Backoff exponencial
    
    // Tenta cada proxy
    for (let i = 0; i < CORS_PROXIES.length; i++) {
      const proxyIndex = (startProxyIndex + i) % CORS_PROXIES.length;
      const proxyUrl = CORS_PROXIES[proxyIndex](url);
      
      try {
        const sourceLabel = source === 'guiadetv' ? 'GuiaDeTV' : 'MeuGuia';
        console.log(`[EPG ${sourceLabel}] ${channelId}: Tentativa ${retry + 1}/${MAX_RETRIES}, proxy ${proxyIndex + 1}/${CORS_PROXIES.length}`);
        
        const response = await fetchWithTimeout(proxyUrl, 15000);
        
        if (response.ok) {
          const html = await response.text();
          
          // Validação específica por fonte
          let isValidHtml = false;
          if (source === 'guiadetv') {
            // guiadetv.com usa data-dt="..." e links de /programa/
            isValidHtml = html.length > 1000 && (html.includes('data-dt=') || html.includes('/programa/'));
          } else {
            // meuguia.tv usa classe "lileft time" e tags <h2>
            isValidHtml = html.length > 1000 && (html.includes('lileft time') || html.includes('<h2>'));
          }
          
          if (isValidHtml) {
            currentProxyIndex = proxyIndex; // Atualiza proxy preferido
            console.log(`[EPG ${sourceLabel}] ${channelId}: Sucesso com proxy ${proxyIndex + 1}`);
            return html;
          } else {
            console.log(`[EPG ${sourceLabel}] ${channelId}: Proxy ${proxyIndex + 1} retornou HTML inválido`);
          }
        } else if (response.status === 429) {
          console.log(`[EPG] ${channelId}: Proxy ${proxyIndex + 1} com rate limit (429)`);
          continue; // Tenta próximo proxy imediatamente
        } else {
          console.log(`[EPG] ${channelId}: Proxy ${proxyIndex + 1} HTTP ${response.status}`);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
        console.log(`[EPG] ${channelId}: Proxy ${proxyIndex + 1} falhou: ${errorMsg}`);
      }
    }
    
    // Aguarda antes do próximo retry (backoff exponencial)
    if (retry < MAX_RETRIES - 1) {
      console.log(`[EPG] ${channelId}: Aguardando ${retryDelay}ms antes de retry...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
  
  console.log(`[EPG] ${channelId}: Falhou após ${MAX_RETRIES} tentativas`);
  return null;
}

/**
 * Busca EPG de um canal (com cache inteligente)
 * Usa guiadetv.com para canais que não funcionam no meuguia.tv
 */
async function fetchChannelEPGAsync(channelId: string, forceRefresh: boolean = false): Promise<Program[]> {
  const meuguiaCode = channelToMeuGuiaCode[channelId];
  const guiadetvSlug = channelToGuiaDeTvSlug[channelId];
  
  if (!meuguiaCode && !guiadetvSlug) {
    console.log(`[EPG] ${channelId}: sem código de EPG em nenhuma fonte`);
    return [];
  }

  // Verifica se precisa atualizar (cache inteligente)
  if (!forceRefresh && !needsUpdate(channelId)) {
    console.log(`[EPG Cache] ${channelId}: Usando cache válido`);
    return epgCache.get(channelId) || [];
  }

  // Evita requisições duplicadas
  if (pendingFetches.has(channelId)) {
    return pendingFetches.get(channelId)!;
  }

  const fetchPromise = (async (): Promise<Program[]> => {
    try {
      let html: string | null = null;
      let programs: Program[] = [];
      let sourceUsed = '';
      
      // Decide qual fonte usar:
      // Se o canal está no mapeamento do guiadetv.com, usa ele PRIMEIRO
      // (pois esses canais não funcionam no meuguia.tv)
      if (guiadetvSlug) {
        const guiadetvUrl = `https://www.guiadetv.com/canal/${guiadetvSlug}`;
        console.log(`[EPG GuiaDeTV] Buscando ${channelId} de ${guiadetvUrl}`);
        
        html = await fetchWithProxyFallback(guiadetvUrl, channelId, 'guiadetv');
        
        if (html) {
          programs = parseGuiaDeTvHTML(html, channelId);
          sourceUsed = 'guiadetv.com';
        }
      }
      
      // Se não encontrou no guiadetv.com ou não está mapeado lá, tenta meuguia.tv
      if (programs.length === 0 && meuguiaCode) {
        const meuguiaUrl = `https://meuguia.tv/programacao/canal/${meuguiaCode}`;
        console.log(`[EPG MeuGuia] Buscando ${channelId} de ${meuguiaUrl}`);
        
        html = await fetchWithProxyFallback(meuguiaUrl, channelId, 'meuguia');
        
        if (html) {
          programs = parseHTMLPrograms(html, channelId);
          sourceUsed = 'meuguia.tv';
        }
      }
      
      if (programs.length === 0) {
        console.log(`[EPG] ${channelId}: Não foi possível obter dados de nenhuma fonte`);
        // Se falhou mas tem cache antigo, mantém ele
        return epgCache.get(channelId) || [];
      }
      
      // Sucesso - salva no cache
      epgCache.set(channelId, programs);
      lastFetch.set(channelId, Date.now());
      notifyListeners(channelId, programs);
      
      // Salva no localStorage
      saveCacheToStorage();
      
      console.log(`[EPG] ${channelId}: ${programs.length} programas salvos (fonte: ${sourceUsed})`);
      
      return programs;
    } catch (e) {
      console.error(`[EPG] ${channelId}: erro`, e);
      return epgCache.get(channelId) || [];
    } finally {
      pendingFetches.delete(channelId);
    }
  })();

  pendingFetches.set(channelId, fetchPromise);
  return fetchPromise;
}

// ============================================================================
// INICIALIZAÇÃO E CARREGAMENTO
// ============================================================================

let initialized = false;

/**
 * Inicializa o serviço de EPG
 * - Carrega cache do localStorage
 * - Verifica quais canais precisam atualizar
 * - Carrega apenas os necessários em background
 */
export async function fetchRealEPG(): Promise<boolean> {
  if (initialized) {
    console.log('[EPG] Já inicializado');
    return true;
  }
  
  initialized = true;
  console.log('[EPG] Inicializando serviço com cache inteligente...');
  
  // Carrega cache persistente
  loadCacheFromStorage();
  
  // Identifica canais que precisam atualizar
  const channelsToUpdate = Object.keys(channelToMeuGuiaCode).filter(needsUpdate);
  
  console.log(`[EPG] ${epgCache.size} canais em cache, ${channelsToUpdate.length} precisam atualizar`);
  
  // Se tem canais para atualizar, carrega em background
  if (channelsToUpdate.length > 0) {
    loadChannelsInBackground(channelsToUpdate);
  }
  
  return true;
}

/**
 * Carrega lista de canais em segundo plano
 */
async function loadChannelsInBackground(channelIds: string[]): Promise<void> {
  console.log(`[EPG] Carregando ${channelIds.length} canais em background...`);
  
  const batchSize = 2; // Reduzido para evitar rate limit
  const delayBetweenBatches = 1500; // 1.5 segundos entre lotes
  
  for (let i = 0; i < channelIds.length; i += batchSize) {
    const batch = channelIds.slice(i, i + batchSize);
    
    await Promise.all(
      batch.map(channelId => fetchChannelEPGAsync(channelId))
    );
    
    console.log(`[EPG] Carregados ${Math.min(i + batchSize, channelIds.length)}/${channelIds.length} canais`);
    
    if (i + batchSize < channelIds.length) {
      await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
    }
  }
  
  // Salva tudo no localStorage ao final
  saveCacheToStorage();
  
  console.log('[EPG] Carregamento em background concluído!');
}

// ============================================================================
// FUNÇÕES PÚBLICAS
// ============================================================================

/**
 * Obtém programação de um canal
 */
export function getChannelEPG(channelId: string): ChannelEPG {
  // Verifica se precisa atualizar e dispara em background
  if (needsUpdate(channelId)) {
    fetchChannelEPGAsync(channelId);
  }
  
  return {
    channelId,
    programs: epgCache.get(channelId) || [],
  };
}

/**
 * Obtém programa atual (versão síncrona)
 */
export function getCurrentProgram(channelId: string): CurrentProgram | null {
  if (!epgCache.has(channelId)) {
    fetchChannelEPGAsync(channelId);
    return null;
  }
  
  const programs = epgCache.get(channelId) || [];
  if (programs.length === 0) return null;
  
  const now = new Date();
  
  const current = programs.find(p => p.startTime <= now && p.endTime > now);
  if (!current) return null;
  
  const next = programs.find(p => p.startTime > now);
  
  const total = current.endTime.getTime() - current.startTime.getTime();
  const elapsed = now.getTime() - current.startTime.getTime();
  const progress = Math.min(100, Math.max(0, (elapsed / total) * 100));
  
  return { current, next: next || null, progress };
}

/**
 * Obtém programa atual (versão assíncrona)
 */
export async function getCurrentProgramAsync(channelId: string): Promise<CurrentProgram | null> {
  await fetchChannelEPGAsync(channelId);
  return getCurrentProgram(channelId);
}

/**
 * Busca EPG de múltiplos canais
 */
export function getBulkEPG(channelIds: string[]): Map<string, ChannelEPG> {
  const result = new Map<string, ChannelEPG>();
  channelIds.forEach(id => result.set(id, getChannelEPG(id)));
  return result;
}

/**
 * Limpa todo o cache (memória e localStorage)
 */
export function clearEPGCache(): void {
  epgCache.clear();
  lastFetch.clear();
  localStorage.removeItem(CACHE_KEY);
  localStorage.removeItem(CACHE_META_KEY);
  console.log('[EPG Cache] Cache limpo');
}

/**
 * Verifica se canal tem EPG em cache
 */
export function hasEPG(channelId: string): boolean {
  return (epgCache.get(channelId)?.length || 0) > 0;
}

/**
 * Retorna estatísticas do EPG
 */
export function getEPGStats() {
  let totalPrograms = 0;
  let latestUpdate = 0;
  let channelsNeedingUpdate = 0;
  
  epgCache.forEach(programs => totalPrograms += programs.length);
  lastFetch.forEach(time => { if (time > latestUpdate) latestUpdate = time; });
  
  Object.keys(channelToMeuGuiaCode).forEach(channelId => {
    if (needsUpdate(channelId)) channelsNeedingUpdate++;
  });
  
  return {
    channelsWithEPG: epgCache.size,
    totalChannels: Object.keys(channelToMeuGuiaCode).length,
    totalPrograms,
    lastUpdate: latestUpdate > 0 ? new Date(latestUpdate) : null,
    isLoading: pendingFetches.size > 0,
    channelsNeedingUpdate,
    cacheAgeMs: latestUpdate > 0 ? Date.now() - latestUpdate : null,
  };
}

/**
 * Lista todos os canais com suporte a EPG
 */
export function listEPGChannels(): string[] {
  return Object.keys(channelToMeuGuiaCode);
}

/**
 * Força atualização de um canal específico
 */
export async function refreshChannelEPG(channelId: string): Promise<void> {
  await fetchChannelEPGAsync(channelId, true);
}

/**
 * Força atualização de todos os canais
 */
export async function refreshAllEPG(): Promise<void> {
  const allChannels = Object.keys(channelToMeuGuiaCode);
  await loadChannelsInBackground(allChannels);
}

/**
 * Verifica e atualiza canais com programação acabando
 * Chamado periodicamente pelo app
 */
export async function checkAndUpdateExpiring(): Promise<number> {
  const channelsToUpdate = Object.keys(channelToMeuGuiaCode).filter(channelId => {
    const programs = epgCache.get(channelId) || [];
    const now = new Date();
    const futurePrograms = programs.filter(p => p.endTime > now);
    return futurePrograms.length < MIN_FUTURE_PROGRAMS;
  });
  
  if (channelsToUpdate.length > 0) {
    console.log(`[EPG] ${channelsToUpdate.length} canais com programação acabando, atualizando...`);
    await loadChannelsInBackground(channelsToUpdate);
  }
  
  return channelsToUpdate.length;
}
