# Sistema de EPG - Cache Inteligente e Múltiplas Fontes

## Índice
1. [Visão Geral](#visão-geral)
2. [Fontes de EPG](#fontes-de-epg)
3. [Sistema de Múltiplos Proxies CORS](#sistema-de-múltiplos-proxies-cors)
4. [Cache Inteligente Persistente](#cache-inteligente-persistente)
5. [Fluxo de Funcionamento](#fluxo-de-funcionamento)
6. [Canais Suportados](#canais-suportados)
7. [API de Funções](#api-de-funções)

---

## Visão Geral

O serviço de EPG (Electronic Program Guide) foi projetado para ser **resiliente**, **eficiente** e **econômico** em termos de requisições de rede. O sistema combina:

- **Duas fontes de EPG**: meuguia.tv (principal) e guiadetv.com (alternativa)
- **Múltiplos proxies CORS** com fallback automático
- **Cache inteligente** que persiste no localStorage
- **Atualização sob demanda** (mensal ou quando programação acabar)
- **Retry com backoff exponencial**

---

## Fontes de EPG

O sistema usa **duas fontes de dados** para garantir máxima cobertura de canais:

### 1. meuguia.tv (Fonte Principal)
- **URL Base**: `https://meuguia.tv/programacao/canal/{CÓDIGO}`
- **Cobertura**: ~60 canais
- **Formato**: HTML com estrutura `<div class="lileft time">` e `<h2>`

### 2. guiadetv.com (Fonte Alternativa)
- **URL Base**: `https://www.guiadetv.com/canal/{SLUG}`
- **Cobertura**: 13 canais específicos que não funcionam no meuguia.tv
- **Formato**: HTML com atributos `data-dt="YYYY-MM-DD HH:MM:SS"` e links `/programa/`

### Canais que usam guiadetv.com

| Canal | ID | Slug guiadetv.com | Programas |
|-------|-------|------------------|-----------|
| HBO Pop | hbo-pop | hbo-pop | ~37 |
| HBO Xtreme | hbo-xtreme | hbo-xtreme | ~98 |
| HBO Mundi | hbo-mundi | hbo-mundi | ~34 |
| History 2 | history2 | history-2 | ~68 |
| CNN Brasil | cnn-brasil | cnn-brasil | ~31 |
| Cartoonito | cartoonito | cartoonito | ~418 |
| Gloobinho | gloobinho | gloobinho | ~1500 |
| Food Network | food-network | food-network | ~123 |
| HGTV | hgtv | hgtv | ~140 |
| Curta! | curta | curta | ~83 |
| Premiere 2 | premiere2 | premiere-2 | ~90 |
| Premiere 3 | premiere3 | premiere-3 | ~90 |
| Premiere 4 | premiere4 | premiere-4 | ~90 |

### Lógica de Seleção de Fonte

```
┌─────────────────────────────────────────────────────────────┐
│                   fetchChannelEPGAsync(channelId)            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │ Canal está no mapeamento      │
              │ channelToGuiaDeTvSlug?        │
              └───────────────────────────────┘
                    │              │
                   Sim            Não
                    │              │
                    ▼              ▼
         ┌─────────────────┐  ┌─────────────────┐
         │ Busca primeiro  │  │ Busca no        │
         │ no guiadetv.com │  │ meuguia.tv      │
         └─────────────────┘  └─────────────────┘
                    │              │
            Encontrou?     Encontrou?
                    │              │
                   Sim            Sim
                    │              │
                    ▼              ▼
         ┌─────────────────────────────────────┐
         │         Retorna programas           │
         └─────────────────────────────────────┘
```

---

## Sistema de Múltiplos Proxies CORS

### Por que usar proxies?

Tanto `meuguia.tv` quanto `guiadetv.com` não permitem requisições diretas do browser (CORS). Para contornar isso, usamos proxies públicos. Cada proxy tem limitações:

| Problema | Solução |
|----------|---------|
| Rate limiting (429) | Rotaciona para outro proxy |
| Servidor indisponível | Tenta próximo da lista |
| Timeout | Retry com backoff exponencial |

---

## Sistema de Múltiplos Proxies CORS

### Lista de Proxies Disponíveis

```typescript
const CORS_PROXIES = [
  // 1. AllOrigins - Mais estável, mas tem rate limit
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  
  // 2. CorsProxy.io - Bom fallback, rápido
  (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  
  // 3. CodeTabs - Alternativa confiável
  (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  
  // 4. Cors.sh - Requer header especial às vezes
  (url) => `https://proxy.cors.sh/${url}`,
  
  // 5. ThingProxy - Último recurso
  (url) => `https://thingproxy.freeboard.io/fetch/${url}`,
];
```

### Características de Cada Proxy

| Proxy | URL Base | Rate Limit | Velocidade | Confiabilidade |
|-------|----------|------------|------------|----------------|
| AllOrigins | api.allorigins.win | ~100/min | Rápido | Alta |
| CorsProxy.io | corsproxy.io | ~50/min | Muito rápido | Alta |
| CodeTabs | api.codetabs.com | ~30/min | Médio | Média |
| Cors.sh | proxy.cors.sh | ~20/min | Médio | Média |
| ThingProxy | thingproxy.freeboard.io | ~10/min | Lento | Baixa |

### Algoritmo de Fallback

```
┌─────────────────────────────────────────────────────────────┐
│                   fetchWithProxyFallback()                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │ Começa pelo último proxy que  │
              │ funcionou (currentProxyIndex) │
              └───────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
    ┌─────────┐          ┌─────────┐          ┌─────────┐
    │ Proxy 1 │───Fail───│ Proxy 2 │───Fail───│ Proxy 3 │
    └─────────┘          └─────────┘          └─────────┘
         │                                         │
         │ Success                                 │ Fail
         ▼                                         ▼
    ┌─────────────────┐                  ┌─────────────────┐
    │ Atualiza        │                  │ Todos falharam? │
    │ currentProxy=1  │                  └─────────────────┘
    │ Retorna HTML    │                           │
    └─────────────────┘                           ▼
                                         ┌─────────────────┐
                                         │ Retry < MAX?    │
                                         └─────────────────┘
                                              │        │
                                             Sim      Não
                                              │        │
                                              ▼        ▼
                                    ┌──────────┐  ┌──────────┐
                                    │ Aguarda  │  │ Retorna  │
                                    │ backoff  │  │ null     │
                                    │ e tenta  │  └──────────┘
                                    │ denovo   │
                                    └──────────┘
```

### Código do Sistema de Fallback

```typescript
async function fetchWithProxyFallback(url: string, channelId: string): Promise<string | null> {
  const startProxyIndex = currentProxyIndex;
  
  for (let retry = 0; retry < MAX_RETRIES; retry++) {
    // Backoff exponencial: 1s, 2s, 4s
    const retryDelay = INITIAL_RETRY_DELAY * Math.pow(2, retry);
    
    // Tenta cada proxy
    for (let i = 0; i < CORS_PROXIES.length; i++) {
      const proxyIndex = (startProxyIndex + i) % CORS_PROXIES.length;
      const proxyUrl = CORS_PROXIES[proxyIndex](url);
      
      try {
        const response = await fetchWithTimeout(proxyUrl, 15000);
        
        if (response.ok) {
          const html = await response.text();
          
          // Verifica se é HTML válido
          if (html.length > 1000 && html.includes('lileft time')) {
            currentProxyIndex = proxyIndex; // Memoriza o que funcionou
            return html;
          }
        } else if (response.status === 429) {
          continue; // Rate limit - próximo proxy
        }
      } catch (error) {
        continue; // Erro - próximo proxy
      }
    }
    
    // Aguarda antes do próximo retry
    if (retry < MAX_RETRIES - 1) {
      await new Promise(r => setTimeout(r, retryDelay));
    }
  }
  
  return null;
}
```

### Backoff Exponencial

O sistema usa **backoff exponencial** para evitar sobrecarregar os proxies:

| Tentativa | Delay |
|-----------|-------|
| 1ª | 0ms (imediato) |
| 2ª | 1000ms (1s) |
| 3ª | 2000ms (2s) |
| 4ª | 4000ms (4s) |

---

## Cache Inteligente Persistente

### Estrutura do Cache

```typescript
// Cache em memória (rápido)
const epgCache: Map<string, Program[]> = new Map();
const lastFetch: Map<string, number> = new Map();

// Cache persistente (localStorage)
// Chave: 'epg_cache_v2'
// Valor: JSON com todos os programas
interface CacheData {
  [channelId: string]: Program[];
}

// Metadados do cache
// Chave: 'epg_cache_meta_v2'
interface CacheMeta {
  lastFullLoad: number;  // Timestamp da última carga completa
  channelLastUpdate: {   // Timestamp por canal
    [channelId: string]: number;
  };
}
```

### Regras de Atualização

O cache é atualizado **apenas quando necessário**:

| Condição | Ação |
|----------|------|
| Sem cache | Carrega imediatamente |
| Cache > 30 dias | Atualiza (expirado) |
| < 5 programas futuros | Atualiza (acabando) |
| Cache válido | Usa cache existente |

### Fluxo de Decisão do Cache

```
┌─────────────────────────────────────────────────────────────┐
│                      needsUpdate()                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │ Tem cache?       │
                    └──────────────────┘
                         │         │
                        Não       Sim
                         │         │
                         ▼         ▼
                 ┌───────────┐  ┌──────────────────┐
                 │ ATUALIZAR │  │ Cache > 30 dias? │
                 └───────────┘  └──────────────────┘
                                      │         │
                                     Sim       Não
                                      │         │
                                      ▼         ▼
                              ┌───────────┐  ┌────────────────────┐
                              │ ATUALIZAR │  │ Programas futuros  │
                              └───────────┘  │ < 5?               │
                                             └────────────────────┘
                                                  │         │
                                                 Sim       Não
                                                  │         │
                                                  ▼         ▼
                                          ┌───────────┐  ┌──────────┐
                                          │ ATUALIZAR │  │ USAR     │
                                          └───────────┘  │ CACHE    │
                                                         └──────────┘
```

### Persistência no localStorage

```typescript
// Carregar cache ao iniciar
function loadCacheFromStorage(): void {
  const cached = localStorage.getItem('epg_cache_v2');
  const meta = localStorage.getItem('epg_cache_meta_v2');
  
  if (cached && meta) {
    const data = JSON.parse(cached);
    const metaData = JSON.parse(meta);
    
    // Restaura em memória com conversão de datas
    Object.entries(data).forEach(([channelId, programs]) => {
      const parsed = programs.map(p => ({
        ...p,
        startTime: new Date(p.startTime),
        endTime: new Date(p.endTime),
      }));
      epgCache.set(channelId, parsed);
      lastFetch.set(channelId, metaData.channelLastUpdate[channelId]);
    });
  }
}

// Salvar cache após atualizações
function saveCacheToStorage(): void {
  const data = {};
  const meta = { lastFullLoad: Date.now(), channelLastUpdate: {} };
  
  epgCache.forEach((programs, channelId) => {
    data[channelId] = programs;
    meta.channelLastUpdate[channelId] = lastFetch.get(channelId);
  });
  
  localStorage.setItem('epg_cache_v2', JSON.stringify(data));
  localStorage.setItem('epg_cache_meta_v2', JSON.stringify(meta));
}
```

### Benefícios do Cache Inteligente

| Cenário | Antes | Depois |
|---------|-------|--------|
| Primeira visita | ~60 requisições | ~60 requisições |
| Segunda visita (mesmo dia) | ~60 requisições | 0 requisições |
| Visita após 1 semana | ~60 requisições | 0 requisições |
| Visita após 1 mês | ~60 requisições | ~60 requisições |
| Canal com programação acabando | Não atualiza | Atualiza apenas esse |

---

## Fluxo de Funcionamento

### Inicialização do Serviço

```
┌─────────────────────────────────────────────────────────────┐
│                      fetchRealEPG()                          │
│                    (chamada no App.tsx)                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │ Já inicializado? │
                    └──────────────────┘
                         │         │
                        Sim       Não
                         │         │
                         ▼         ▼
                 ┌───────────┐  ┌──────────────────┐
                 │ return    │  │ loadCache        │
                 │ true      │  │ FromStorage()    │
                 └───────────┘  └──────────────────┘
                                         │
                                         ▼
                              ┌──────────────────────┐
                              │ Identificar canais   │
                              │ que precisam         │
                              │ atualizar            │
                              └──────────────────────┘
                                         │
                                         ▼
                              ┌──────────────────────┐
                              │ loadChannelsIn       │
                              │ Background()         │
                              │ (apenas necessários) │
                              └──────────────────────┘
```

### Busca de Programação de um Canal

```
┌─────────────────────────────────────────────────────────────┐
│                    getChannelEPG(channelId)                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │ needsUpdate()?   │
                    └──────────────────┘
                         │         │
                        Sim       Não
                         │         │
                         ▼         ▼
              ┌────────────────┐  ┌────────────────┐
              │ Dispara fetch  │  │ Retorna cache  │
              │ em background  │  │ imediatamente  │
              └────────────────┘  └────────────────┘
                       │                  │
                       ▼                  │
              ┌────────────────┐          │
              │ Retorna cache  │          │
              │ atual (pode    │          │
              │ estar vazio)   │          │
              └────────────────┘          │
                       │                  │
                       └──────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │ { channelId,     │
                    │   programs: [] } │
                    └──────────────────┘
```

---

## Canais Suportados

### Total: 73 canais com EPG funcionando

**Fontes de dados:**
- **meuguia.tv**: ~60 canais (fonte principal)
- **guiadetv.com**: 13 canais (fonte alternativa para canais que não funcionam no meuguia.tv)

> **Nota:** Os canais Adult Swim, Nickelodeon, Discovery ID, Globo ES, Globo AM e SporTV 4 não possuem EPG disponível em nenhuma das fontes.

#### Telecine (6)
| ID | Código | Canal |
|----|--------|-------|
| telecine-action | TC2 | Telecine Action |
| telecine-premium | TC1 | Telecine Premium |
| telecine-pipoca | TC4 | Telecine Pipoca |
| telecine-cult | TC5 | Telecine Cult |
| telecine-fun | TC6 | Telecine Fun |
| telecine-touch | TC3 | Telecine Touch |

#### HBO (7) - 4 meuguia.tv + 3 guiadetv.com
| ID | Código | Canal | Fonte |
|----|--------|-------|-------|
| hbo | HBO | HBO | meuguia.tv |
| hbo2 | HB2 | HBO 2 | meuguia.tv |
| hbo-family | HFA | HBO Family | meuguia.tv |
| hbo-plus | HPL | HBO Plus | meuguia.tv |
| hbo-pop | HPO | HBO Pop | **guiadetv.com** |
| hbo-xtreme | HXT | HBO Xtreme | **guiadetv.com** |
| hbo-mundi | HMU | HBO Mundi | **guiadetv.com** |

#### Globo (5)
| ID | Código | Canal |
|----|--------|-------|
| globo-sp | GRD | Globo São Paulo |
| globo-rj | GRD | Globo Rio |
| globo-mg | GRD | Globo Minas |
| globo-rs | GRD | Globo RS |
| globo-news | GLN | Globo News |

#### SporTV (3)
| ID | Código | Canal |
|----|--------|-------|
| sportv | SPO | SporTV |
| sportv2 | SP2 | SporTV 2 |
| sportv3 | SP3 | SporTV 3 |

#### ESPN (5)
| ID | Código | Canal |
|----|--------|-------|
| espn | ESP | ESPN |
| espn2 | ES2 | ESPN 2 |
| espn3 | ES3 | ESPN 3 |
| espn4 | ES4 | ESPN 4 |
| espn5 | ES5 | ESPN Extra |

#### TV Aberta (8)
| ID | Código | Canal |
|----|--------|-------|
| sbt | SBT | SBT |
| band | BAN | Band |
| record | REC | Record |
| rede-tv | RTV | RedeTV! |
| tv-brasil | TED | TV Brasil |
| aparecida | TAP | TV Aparecida |
| cultura | CUL | TV Cultura |
| tv-gazeta | GAZ | TV Gazeta |

#### Notícias (3)
| ID | Código | Canal | Fonte |
|----|--------|-------|-------|
| band-news | NEW | BandNews | meuguia.tv |
| record-news | RCN | Record News | meuguia.tv |
| cnn-brasil | CNB | CNN Brasil | **guiadetv.com** |

#### Infantil (5)
| ID | Código | Canal | Fonte |
|----|--------|-------|-------|
| cartoon-network | CAR | Cartoon Network | meuguia.tv |
| discovery-kids | DIK | Discovery Kids | meuguia.tv |
| gloob | GOB | Gloob | meuguia.tv |
| cartoonito | CTO | Cartoonito | **guiadetv.com** |
| gloobinho | GBI | Gloobinho | **guiadetv.com** |

#### Documentários (11)
| ID | Código | Canal | Fonte |
|----|--------|-------|-------|
| discovery | DIS | Discovery Channel | meuguia.tv |
| discovery-turbo | DTU | Discovery Turbo | meuguia.tv |
| discovery-world | DIW | Discovery World | meuguia.tv |
| discovery-science | DSC | Discovery Science | meuguia.tv |
| discovery-hh | HEA | Discovery Home & Health | meuguia.tv |
| animal-planet | APL | Animal Planet | meuguia.tv |
| history | HIS | History Channel | meuguia.tv |
| history2 | H2H | History 2 | **guiadetv.com** |
| tlc | TRV | TLC | meuguia.tv |
| food-network | FNT | Food Network | **guiadetv.com** |
| hgtv | HGT | HGTV | **guiadetv.com** |

#### Séries (7)
| ID | Código | Canal |
|----|--------|-------|
| warner | WBT | Warner Channel |
| tnt | TNT | TNT |
| tnt-series | TNS | TNT Séries |
| axn | AXN | AXN |
| sony | SET | Sony Channel |
| universal-tv | USA | Universal TV |
| ae | MDO | A&E |

#### Filmes (7)
| ID | Código | Canal | Fonte |
|----|--------|-------|-------|
| amc | MGM | AMC | meuguia.tv |
| tcm | TCM | TCM | meuguia.tv |
| space | SPA | Space | meuguia.tv |
| cinemax | MNX | Cinemax | meuguia.tv |
| megapix | MPX | Megapix | meuguia.tv |
| studio-universal | HAL | Studio Universal | meuguia.tv |
| curta | CUR | Curta! | **guiadetv.com** |

#### Entretenimento (6)
| ID | Código | Canal |
|----|--------|-------|
| multishow | MSW | Multishow |
| bis | MSH | BIS |
| viva | VIV | Viva |
| off | OFF | OFF |
| gnt | GNT | GNT |
| arte1 | BQ5 | Arte1 |

#### Esportes (6)
| ID | Código | Canal | Fonte |
|----|--------|-------|-------|
| premiere | 121 | Premiere | meuguia.tv |
| combate | 135 | Combate | meuguia.tv |
| band-sports | BSP | Band Sports | meuguia.tv |
| premiere2 | PR2 | Premiere 2 | **guiadetv.com** |
| premiere3 | PR3 | Premiere 3 | **guiadetv.com** |
| premiere4 | PR4 | Premiere 4 | **guiadetv.com** |

### Canais SEM EPG disponível

| ID | Nome | Motivo |
|----|------|--------|
| adult-swim | Adult Swim | Não encontrado em nenhuma fonte |
| nickelodeon | Nickelodeon | Página existe mas sem dados parseáveis |
| discovery-id | Investigation Discovery | Página existe mas sem dados parseáveis |
| globo-es | Globo ES | Não encontrado |
| globo-am | Globo AM | Não encontrado |
| sportv4 | SporTV 4 | Não encontrado |
| 24h-simpsons | 24h Simpsons | Canal 24h (sem grade tradicional) |
| 24h-dragonball | 24h Dragon Ball | Canal 24h (sem grade tradicional) |
| 24h-odeia-chris | 24h Odeia Chris | Canal 24h (sem grade tradicional) |
| playboy | Playboy TV | Canal adulto (sem EPG) |
| sexy-hot | Sexy Hot | Canal adulto (sem EPG) |

---

## API de Funções

### Funções Principais

#### `fetchRealEPG()`
Inicializa o serviço de EPG.

```typescript
await fetchRealEPG();
```

#### `getChannelEPG(channelId)`
Obtém programação de um canal (síncrono).

```typescript
const epg = getChannelEPG('hbo');
console.log(epg.programs); // Array de programas
```

#### `getCurrentProgram(channelId)`
Obtém programa atual e próximo.

```typescript
const current = getCurrentProgram('globo-sp');
if (current) {
  console.log(`Agora: ${current.current.title}`);
  console.log(`Próximo: ${current.next?.title}`);
  console.log(`Progresso: ${current.progress}%`);
}
```

### Funções de Cache

#### `clearEPGCache()`
Limpa todo o cache (memória + localStorage).

```typescript
clearEPGCache();
```

#### `refreshChannelEPG(channelId)`
Força atualização de um canal.

```typescript
await refreshChannelEPG('espn');
```

#### `refreshAllEPG()`
Força atualização de todos os canais.

```typescript
await refreshAllEPG();
```

#### `checkAndUpdateExpiring()`
Verifica e atualiza canais com programação acabando.

```typescript
// Pode ser chamado periodicamente
const updated = await checkAndUpdateExpiring();
console.log(`${updated} canais atualizados`);
```

### Funções de Status

#### `getEPGStats()`
Retorna estatísticas do sistema.

```typescript
const stats = getEPGStats();
console.log({
  channelsWithEPG: stats.channelsWithEPG,    // 60
  totalChannels: stats.totalChannels,         // 60
  totalPrograms: stats.totalPrograms,         // ~25000
  lastUpdate: stats.lastUpdate,               // Date
  isLoading: stats.isLoading,                 // boolean
  channelsNeedingUpdate: stats.channelsNeedingUpdate,
  cacheAgeMs: stats.cacheAgeMs,              // ms desde última atualização
});
```

#### `hasEPG(channelId)`
Verifica se canal tem EPG em cache.

```typescript
if (hasEPG('hbo')) {
  showEPGBadge();
}
```

#### `listEPGChannels()`
Lista todos os canais suportados.

```typescript
const channels = listEPGChannels();
// ['telecine-action', 'telecine-premium', ...]
```

---

## Exemplo de Uso Completo

```typescript
// App.tsx
import { fetchRealEPG, onEPGUpdate, getCurrentProgram } from './services/epgService';

function App() {
  const [currentProgram, setCurrentProgram] = useState(null);
  
  useEffect(() => {
    // Inicializa o serviço
    fetchRealEPG();
    
    // Escuta atualizações
    const unsubscribe = onEPGUpdate((channelId, programs) => {
      console.log(`${channelId} atualizado com ${programs.length} programas`);
    });
    
    return unsubscribe;
  }, []);
  
  // Obtém programa atual quando mudar de canal
  useEffect(() => {
    const program = getCurrentProgram(selectedChannel);
    setCurrentProgram(program);
  }, [selectedChannel]);
  
  return (
    <div>
      {currentProgram && (
        <div>
          <h2>{currentProgram.current.title}</h2>
          <progress value={currentProgram.progress} max={100} />
        </div>
      )}
    </div>
  );
}
```
