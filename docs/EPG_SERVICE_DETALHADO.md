# EPG Service - Documentação Técnica Detalhada

## Índice
1. [Visão Geral](#visão-geral)
2. [Arquitetura do Sistema](#arquitetura-do-sistema)
3. [Sistema de Cache](#sistema-de-cache)
4. [Mapeamento de Canais](#mapeamento-de-canais)
5. [Sistema de Listeners](#sistema-de-listeners)
6. [Parsing de HTML](#parsing-de-html)
7. [Fluxo de Busca de Dados](#fluxo-de-busca-de-dados)
8. [Funções Exportadas](#funções-exportadas)
9. [Casos de Uso](#casos-de-uso)
10. [Diagramas de Sequência](#diagramas-de-sequência)

---

## Visão Geral

O **EPG Service** (Electronic Program Guide Service) é responsável por buscar, processar e gerenciar a programação de TV dos canais disponíveis no aplicativo. O serviço utiliza **web scraping** do site [meuguia.tv](https://meuguia.tv) para obter os dados de programação em tempo real.

### Características Principais
- **Web Scraping**: Extrai dados diretamente do HTML do meuguia.tv
- **Cache Inteligente**: Armazena dados por 30 minutos para reduzir requisições
- **Deduplicação**: Evita requisições duplicadas simultâneas
- **Carregamento em Background**: Pré-carrega EPG de todos os canais
- **Sistema Reativo**: Notifica componentes sobre atualizações via listeners

---

## Arquitetura do Sistema

```
┌─────────────────────────────────────────────────────────────────┐
│                        EPG Service                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │   Cache      │    │  Listeners   │    │  Pending Fetches │  │
│  │  (Map)       │    │   (Set)      │    │     (Map)        │  │
│  └──────────────┘    └──────────────┘    └──────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Channel to MeuGuia Code Mapping             │   │
│  │                     (Record)                              │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                     Funções Principais                           │
│  ┌─────────────┐ ┌──────────────┐ ┌───────────────────────┐    │
│  │ fetchReal   │ │ getChannel   │ │ getCurrentProgram     │    │
│  │ EPG()       │ │ EPG()        │ │ (Sync/Async)          │    │
│  └─────────────┘ └──────────────┘ └───────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │   AllOrigins     │
                    │   CORS Proxy     │
                    └──────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │   meuguia.tv     │
                    │   (HTML Source)  │
                    └──────────────────┘
```

---

## Sistema de Cache

### Estruturas de Dados

```typescript
// Cache principal: armazena programas por canal
const epgCache: Map<string, Program[]> = new Map();

// Registro de última atualização por canal
const lastFetch: Map<string, number> = new Map();

// Duração do cache: 30 minutos
const CACHE_DURATION = 1800000; // millisegundos

// Requisições pendentes (evita duplicação)
const pendingFetches: Map<string, Promise<Program[]>> = new Map();
```

### Fluxo do Cache

```
┌─────────────────────────────────────────────────────────────┐
│                    Verificação de Cache                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │ Cache existe?    │
                    └──────────────────┘
                         │         │
                        Sim       Não
                         │         │
                         ▼         │
              ┌──────────────────┐ │
              │ Cache válido?    │ │
              │ (< 30 min)       │ │
              └──────────────────┘ │
                   │         │     │
                  Sim       Não    │
                   │         │     │
                   ▼         └─────┼─────┐
          ┌─────────────┐          │     │
          │ Retorna     │          ▼     ▼
          │ do cache    │    ┌─────────────────┐
          └─────────────┘    │ Fetch pendente? │
                             └─────────────────┘
                                  │         │
                                 Sim       Não
                                  │         │
                                  ▼         ▼
                         ┌───────────┐  ┌───────────┐
                         │ Aguarda   │  │ Nova      │
                         │ pendente  │  │ requisição│
                         └───────────┘  └───────────┘
```

### Estados do Cache

| Estado | Condição | Ação |
|--------|----------|------|
| **HIT** | Cache existe E tempo < 30min | Retorna dados do cache |
| **MISS** | Cache não existe OU tempo >= 30min | Busca novos dados |
| **PENDING** | Requisição já em andamento | Aguarda requisição existente |

---

## Mapeamento de Canais

O serviço mantém um mapeamento entre os IDs internos do aplicativo e os códigos do meuguia.tv:

### Categorias de Canais Mapeados

#### Telecine (6 canais)
| ID Interno | Código MeuGuia | Canal |
|------------|----------------|-------|
| telecine-action | TC2 | Telecine Action |
| telecine-premium | TC1 | Telecine Premium |
| telecine-pipoca | TC4 | Telecine Pipoca |
| telecine-cult | TC5 | Telecine Cult |
| telecine-fun | TC6 | Telecine Fun |
| telecine-touch | TC3 | Telecine Touch |

#### HBO (7 canais)
| ID Interno | Código MeuGuia | Canal |
|------------|----------------|-------|
| hbo | HBO | HBO |
| hbo2 | HB2 | HBO 2 |
| hbo-family | HFA | HBO Family |
| hbo-plus | HPL | HBO Plus |
| hbo-mundi | HMU | HBO Mundi |
| hbo-pop | HPO | HBO Pop |
| hbo-xtreme | HXT | HBO Xtreme |

#### Globo (5 canais)
| ID Interno | Código MeuGuia | Canal |
|------------|----------------|-------|
| globo-sp | GRD | Globo São Paulo |
| globo-rj | GRD | Globo Rio |
| globo-mg | GRD | Globo Minas |
| globo-rs | GRD | Globo RS |
| globo-news | GLN | Globo News |

#### SporTV (3 canais)
| ID Interno | Código MeuGuia | Canal |
|------------|----------------|-------|
| sportv | SPO | SporTV |
| sportv2 | SP2 | SporTV 2 |
| sportv3 | SP3 | SporTV 3 |

#### ESPN (5 canais)
| ID Interno | Código MeuGuia | Canal |
|------------|----------------|-------|
| espn | ESP | ESPN |
| espn2 | ES2 | ESPN 2 |
| espn3 | ES3 | ESPN 3 |
| espn4 | ES4 | ESPN 4 |
| espn5 | ES5 | ESPN Extra |

#### TV Aberta (8 canais)
| ID Interno | Código MeuGuia | Canal |
|------------|----------------|-------|
| sbt | SBT | SBT |
| band | BAN | Band |
| record | REC | Record |
| rede-tv | RTV | RedeTV! |
| tv-brasil | TED | TV Brasil |
| aparecida | TAP | TV Aparecida |
| cultura | CUL | TV Cultura |
| tv-gazeta | GAZ | TV Gazeta |

#### Notícias (3 canais)
| ID Interno | Código MeuGuia | Canal |
|------------|----------------|-------|
| cnn-brasil | CNB | CNN Brasil |
| band-news | NEW | BandNews |
| record-news | RCN | Record News |

#### Infantil (6 canais)
| ID Interno | Código MeuGuia | Canal |
|------------|----------------|-------|
| cartoon-network | CAR | Cartoon Network |
| cartoonito | CTO | Cartoonito |
| discovery-kids | DIK | Discovery Kids |
| gloob | GOB | Gloob |
| gloobinho | GBI | Gloobinho |
| adult-swim | ASW | Adult Swim |

#### Documentários (9 canais)
| ID Interno | Código MeuGuia | Canal |
|------------|----------------|-------|
| discovery | DIS | Discovery Channel |
| discovery-turbo | DTU | Discovery Turbo |
| discovery-world | DIW | Discovery World |
| discovery-science | DSC | Discovery Science |
| discovery-hh | HEA | Discovery Home & Health |
| animal-planet | APL | Animal Planet |
| history | HIS | History Channel |
| history2 | H2H | History 2 |
| tlc | TRV | TLC |

#### Séries (7 canais)
| ID Interno | Código MeuGuia | Canal |
|------------|----------------|-------|
| warner | WBT | Warner Channel |
| tnt | TNT | TNT |
| tnt-series | TNS | TNT Séries |
| axn | AXN | AXN |
| sony | SET | Sony Channel |
| universal-tv | USA | Universal TV |
| ae | MDO | A&E |

#### Filmes (6 canais)
| ID Interno | Código MeuGuia | Canal |
|------------|----------------|-------|
| amc | MGM | AMC |
| tcm | TCM | TCM |
| space | SPA | Space |
| cinemax | MNX | Cinemax |
| megapix | MPX | Megapix |
| studio-universal | HAL | Studio Universal |

#### Entretenimento (6 canais)
| ID Interno | Código MeuGuia | Canal |
|------------|----------------|-------|
| multishow | MSW | Multishow |
| bis | MSH | BIS |
| viva | VIV | Viva |
| off | OFF | OFF |
| gnt | GNT | GNT |
| arte1 | BQ5 | Arte1 |

#### Esportes Premium (3 canais)
| ID Interno | Código MeuGuia | Canal |
|------------|----------------|-------|
| premiere | 121 | Premiere |
| combate | 135 | Combate |
| band-sports | BSP | Band Sports |

**Total: 74 canais mapeados**

---

## Sistema de Listeners

O serviço implementa um padrão **Observer** para notificar componentes sobre atualizações:

### Estrutura

```typescript
type EPGListener = (channelId: string, programs: Program[]) => void;
const listeners: Set<EPGListener> = new Set();
```

### Fluxo de Notificação

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Componente    │     │   EPG Service    │     │   meuguia.tv    │
│   (React)       │     │                  │     │                 │
└────────┬────────┘     └────────┬─────────┘     └────────┬────────┘
         │                       │                        │
         │  onEPGUpdate(cb)      │                        │
         │──────────────────────>│                        │
         │                       │                        │
         │  (listener registrado)│                        │
         │<──────────────────────│                        │
         │                       │                        │
         │                       │    fetch HTML          │
         │                       │───────────────────────>│
         │                       │                        │
         │                       │    HTML response       │
         │                       │<───────────────────────│
         │                       │                        │
         │                       │  (parse + cache)       │
         │                       │                        │
         │  callback(channelId,  │                        │
         │           programs)   │                        │
         │<──────────────────────│                        │
         │                       │                        │
```

### Funções de Listener

```typescript
// Registrar listener
export function onEPGUpdate(listener: EPGListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener); // Retorna função de cleanup
}

// Notificar listeners (interno)
function notifyListeners(channelId: string, programs: Program[]): void {
  listeners.forEach(listener => {
    try {
      listener(channelId, programs);
    } catch (e) {
      console.error('Erro em listener EPG:', e);
    }
  });
}
```

### Caso de Uso em Componentes React

```typescript
// Exemplo de uso em componente
useEffect(() => {
  const unsubscribe = onEPGUpdate((channelId, programs) => {
    if (channelId === currentChannelId) {
      setProgramas(programs);
    }
  });
  
  return unsubscribe; // Cleanup ao desmontar
}, [currentChannelId]);
```

---

## Parsing de HTML

### Estrutura do HTML do meuguia.tv

O HTML do meuguia.tv segue uma estrutura específica que o parser identifica:

```html
<!-- Cabeçalho de data -->
<li class="subheader">25/12</li>

<!-- Programa individual -->
<div class='lileft time'>20:30</div>
...
<h2>Nome do Programa</h2>
...
<h3>Categoria</h3>
```

### Algoritmo de Parsing

```
┌─────────────────────────────────────────────────────────────┐
│                   parseHTMLPrograms()                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │ 1. Limpar HTML   │
                    │ (remove ERB)     │
                    └──────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │ 2. Extrair       │
                    │ cabeçalhos de    │
                    │ data (DD/MM)     │
                    └──────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │ 3. Extrair       │
                    │ programas via    │
                    │ regex            │
                    └──────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │ 4. Associar      │
                    │ programa à data  │
                    │ correta          │
                    └──────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │ 5. Detectar      │
                    │ virada de        │
                    │ meia-noite       │
                    └──────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │ 6. Ordenar por   │
                    │ horário          │
                    └──────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │ 7. Ajustar       │
                    │ horários de      │
                    │ término          │
                    └──────────────────┘
```

### Expressões Regulares Utilizadas

```typescript
// Regex para extrair programas
const programRegex = /<div class=['"]lileft time['"]>\s*(\d{1,2}:\d{2})\s*<\/div>[\s\S]*?<h2>([^<]+)<\/h2>[\s\S]*?<h3>([^<]*)<\/h3>/gi;

// Regex para cabeçalhos de data
const headerRegex = /<li class="subheader[^"]*">[^<]*?(\d{1,2})\/(\d{1,2})[^<]*<\/li>/gi;
```

### Detecção de Virada de Meia-Noite

```typescript
// Se a hora diminuiu muito (ex: de 23h para 01h), passou meia-noite
if (lastHour !== -1 && hours < lastHour - 6) {
  programDate = new Date(programDate.getTime() + 24 * 60 * 60 * 1000);
}
```

### Decodificação de Entidades HTML

```typescript
const entities: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
  '&#39;': "'", '&apos;': "'", '&nbsp;': ' ',
  '&eacute;': 'é', '&aacute;': 'á', '&iacute;': 'í',
  '&oacute;': 'ó', '&uacute;': 'ú', '&atilde;': 'ã',
  '&otilde;': 'õ', '&ccedil;': 'ç', '&ndash;': '–', '&mdash;': '—',
};
```

---

## Fluxo de Busca de Dados

### Proxy CORS

Como o browser bloqueia requisições cross-origin, o serviço usa o AllOrigins como proxy:

```typescript
const url = `https://meuguia.tv/programacao/canal/${meuguiaCode}`;
const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
```

### Fluxo Completo de Fetch

```
┌─────────────────────────────────────────────────────────────────┐
│                    fetchChannelEPGAsync()                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │ Canal tem código │───No──> return []
                    │ meuguia.tv?      │
                    └──────────────────┘
                              │ Sim
                              ▼
                    ┌──────────────────┐
                    │ Cache válido?    │───Sim──> return cache
                    └──────────────────┘
                              │ Não
                              ▼
                    ┌──────────────────┐
                    │ Fetch pendente?  │───Sim──> return pendingFetch
                    └──────────────────┘
                              │ Não
                              ▼
                    ┌──────────────────┐
                    │ Criar Promise    │
                    │ e adicionar a    │
                    │ pendingFetches   │
                    └──────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │ Fetch via        │
                    │ AllOrigins proxy │
                    └──────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │ Parse HTML       │
                    │ (programas)      │
                    └──────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │ Salvar no cache  │
                    └──────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │ Notificar        │
                    │ listeners        │
                    └──────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │ Remover de       │
                    │ pendingFetches   │
                    └──────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │ return programs  │
                    └──────────────────┘
```

### Carregamento em Background

```typescript
async function loadAllEPGInBackground(): Promise<void> {
  const allChannelIds = Object.keys(channelToMeuGuiaCode);
  const batchSize = 3;           // 3 canais por vez
  const delayBetweenBatches = 1000; // 1 segundo entre lotes
  
  for (let i = 0; i < allChannelIds.length; i += batchSize) {
    const batch = allChannelIds.slice(i, i + batchSize);
    await Promise.all(batch.map(id => fetchChannelEPGAsync(id)));
    
    if (i + batchSize < allChannelIds.length) {
      await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
    }
  }
}
```

**Características:**
- Carrega 3 canais em paralelo
- Aguarda 1 segundo entre lotes
- Tempo total estimado: ~25 segundos para 74 canais

---

## Funções Exportadas

### 1. `fetchRealEPG()`

**Propósito:** Inicializa o serviço de EPG

```typescript
export async function fetchRealEPG(): Promise<boolean>
```

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| - | - | Sem parâmetros |
| **Retorno** | `Promise<boolean>` | Sempre retorna `true` |

**Comportamento:**
1. Loga inicialização
2. Inicia carregamento em background (apenas uma vez)
3. Retorna imediatamente `true`

**Caso de Uso:**
```typescript
// No início do app
useEffect(() => {
  fetchRealEPG();
}, []);
```

---

### 2. `getChannelEPG(channelId)`

**Propósito:** Obtém programação de um canal (síncrono)

```typescript
export function getChannelEPG(channelId: string): ChannelEPG
```

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `channelId` | `string` | ID interno do canal |
| **Retorno** | `ChannelEPG` | `{ channelId, programs: Program[] }` |

**Comportamento:**
1. Inicia busca em background (se necessário)
2. Retorna cache atual (pode estar vazio)
3. Quando dados chegarem, listeners serão notificados

**Caso de Uso:**
```typescript
// Em componente de lista de canais
const epg = getChannelEPG('globo-sp');
console.log(epg.programs); // Pode estar vazio inicialmente
```

---

### 3. `getCurrentProgram(channelId)`

**Propósito:** Obtém programa atual e próximo (síncrono)

```typescript
export function getCurrentProgram(channelId: string): CurrentProgram | null
```

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `channelId` | `string` | ID interno do canal |
| **Retorno** | `CurrentProgram \| null` | Programa atual, próximo e progresso |

**Estrutura de Retorno:**
```typescript
interface CurrentProgram {
  current: Program;    // Programa em exibição
  next: Program | null; // Próximo programa
  progress: number;     // 0-100 (porcentagem)
}
```

**Comportamento:**
1. Se não tem cache, inicia busca e retorna `null`
2. Encontra programa onde `startTime <= now < endTime`
3. Calcula progresso: `(elapsed / total) * 100`

**Caso de Uso:**
```typescript
// Em card de canal
const currentProgram = getCurrentProgram('hbo');
if (currentProgram) {
  console.log(`Agora: ${currentProgram.current.title}`);
  console.log(`Próximo: ${currentProgram.next?.title}`);
  console.log(`Progresso: ${currentProgram.progress}%`);
}
```

---

### 4. `getCurrentProgramAsync(channelId)`

**Propósito:** Obtém programa atual (aguarda busca se necessário)

```typescript
export async function getCurrentProgramAsync(channelId: string): Promise<CurrentProgram | null>
```

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `channelId` | `string` | ID interno do canal |
| **Retorno** | `Promise<CurrentProgram \| null>` | Programa atual ou null |

**Comportamento:**
1. Aguarda fetch completo
2. Então chama `getCurrentProgram()`

**Caso de Uso:**
```typescript
// Quando precisa garantir que tem dados
const currentProgram = await getCurrentProgramAsync('espn');
if (currentProgram) {
  showProgramInfo(currentProgram);
}
```

---

### 5. `getBulkEPG(channelIds)`

**Propósito:** Obtém EPG de múltiplos canais

```typescript
export function getBulkEPG(channelIds: string[]): Map<string, ChannelEPG>
```

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `channelIds` | `string[]` | Array de IDs de canais |
| **Retorno** | `Map<string, ChannelEPG>` | Mapa de EPG por canal |

**Caso de Uso:**
```typescript
// Para grade de programação
const channelIds = ['globo-sp', 'sbt', 'band', 'record'];
const epgMap = getBulkEPG(channelIds);

channelIds.forEach(id => {
  const epg = epgMap.get(id);
  console.log(`${id}: ${epg?.programs.length || 0} programas`);
});
```

---

### 6. `onEPGUpdate(listener)`

**Propósito:** Registra callback para atualizações

```typescript
export function onEPGUpdate(listener: EPGListener): () => void
```

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `listener` | `(channelId: string, programs: Program[]) => void` | Callback |
| **Retorno** | `() => void` | Função para remover listener |

**Caso de Uso:**
```typescript
useEffect(() => {
  const unsubscribe = onEPGUpdate((channelId, programs) => {
    console.log(`EPG atualizado: ${channelId} com ${programs.length} programas`);
    // Atualizar estado do componente
  });
  
  return unsubscribe;
}, []);
```

---

### 7. `clearEPGCache()`

**Propósito:** Limpa todo o cache

```typescript
export function clearEPGCache(): void
```

**Comportamento:**
- Limpa `epgCache`
- Limpa `lastFetch`
- Não cancela requisições pendentes

**Caso de Uso:**
```typescript
// Para forçar refresh completo
clearEPGCache();
fetchRealEPG();
```

---

### 8. `hasEPG(channelId)`

**Propósito:** Verifica se canal tem EPG em cache

```typescript
export function hasEPG(channelId: string): boolean
```

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `channelId` | `string` | ID do canal |
| **Retorno** | `boolean` | `true` se tem programas em cache |

**Caso de Uso:**
```typescript
// Para mostrar indicador de EPG disponível
if (hasEPG('hbo')) {
  showEPGBadge();
}
```

---

### 9. `getEPGStats()`

**Propósito:** Retorna estatísticas do serviço

```typescript
export function getEPGStats(): {
  channelsWithEPG: number;
  totalPrograms: number;
  lastUpdate: Date | null;
  isLoading: boolean;
}
```

**Caso de Uso:**
```typescript
// Para debug ou dashboard
const stats = getEPGStats();
console.log(`Canais com EPG: ${stats.channelsWithEPG}`);
console.log(`Total de programas: ${stats.totalPrograms}`);
console.log(`Última atualização: ${stats.lastUpdate}`);
console.log(`Carregando: ${stats.isLoading}`);
```

---

### 10. `listEPGChannels()`

**Propósito:** Lista todos os canais com suporte a EPG

```typescript
export function listEPGChannels(): string[]
```

| **Retorno** | `string[]` | Array de IDs de canais mapeados |

**Caso de Uso:**
```typescript
const supportedChannels = listEPGChannels();
console.log(`${supportedChannels.length} canais suportados`);
// ['telecine-action', 'telecine-premium', ...]
```

---

### 11. `refreshChannelEPG(channelId)`

**Propósito:** Força atualização de um canal específico

```typescript
export async function refreshChannelEPG(channelId: string): Promise<void>
```

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `channelId` | `string` | ID do canal |

**Comportamento:**
1. Remove do cache
2. Remove timestamp
3. Busca novamente

**Caso de Uso:**
```typescript
// Botão de refresh no player
async function handleRefresh() {
  await refreshChannelEPG(currentChannel);
  updateUI();
}
```

---

## Casos de Uso

### Caso 1: Inicialização do App

```typescript
// App.tsx
function App() {
  useEffect(() => {
    // Inicia carregamento de EPG em background
    fetchRealEPG();
  }, []);
  
  return <MainContent />;
}
```

**Sequência:**
1. App monta
2. `fetchRealEPG()` é chamado
3. `loadAllEPGInBackground()` inicia
4. Canais são carregados em lotes de 3
5. Listeners são notificados conforme dados chegam

---

### Caso 2: Exibir Programa Atual em Card de Canal

```typescript
function ChannelCard({ channelId }) {
  const [currentProgram, setCurrentProgram] = useState(null);
  
  useEffect(() => {
    // Obtém dados iniciais do cache
    setCurrentProgram(getCurrentProgram(channelId));
    
    // Escuta atualizações
    const unsubscribe = onEPGUpdate((id, programs) => {
      if (id === channelId) {
        setCurrentProgram(getCurrentProgram(channelId));
      }
    });
    
    return unsubscribe;
  }, [channelId]);
  
  if (!currentProgram) {
    return <span>Carregando EPG...</span>;
  }
  
  return (
    <div>
      <span>Agora: {currentProgram.current.title}</span>
      <ProgressBar value={currentProgram.progress} />
    </div>
  );
}
```

---

### Caso 3: Grade de Programação Completa

```typescript
function ProgramGuide({ channelId }) {
  const [programs, setPrograms] = useState([]);
  
  useEffect(() => {
    // Obtém EPG inicial
    const epg = getChannelEPG(channelId);
    setPrograms(epg.programs);
    
    // Atualiza quando novos dados chegam
    const unsubscribe = onEPGUpdate((id, newPrograms) => {
      if (id === channelId) {
        setPrograms(newPrograms);
      }
    });
    
    return unsubscribe;
  }, [channelId]);
  
  return (
    <ul>
      {programs.map(program => (
        <li key={program.id}>
          {formatTime(program.startTime)} - {program.title}
        </li>
      ))}
    </ul>
  );
}
```

---

### Caso 4: Verificar Disponibilidade de EPG

```typescript
function ChannelListItem({ channel }) {
  const hasEPGData = hasEPG(channel.id);
  
  return (
    <div>
      <span>{channel.name}</span>
      {hasEPGData && <EPGBadge />}
    </div>
  );
}
```

---

### Caso 5: Dashboard de Status

```typescript
function EPGStatusDashboard() {
  const [stats, setStats] = useState(getEPGStats());
  
  useEffect(() => {
    const interval = setInterval(() => {
      setStats(getEPGStats());
    }, 5000);
    
    return () => clearInterval(interval);
  }, []);
  
  return (
    <div>
      <p>Canais carregados: {stats.channelsWithEPG}/74</p>
      <p>Programas totais: {stats.totalPrograms}</p>
      <p>Status: {stats.isLoading ? 'Carregando...' : 'Pronto'}</p>
      <p>Última atualização: {stats.lastUpdate?.toLocaleString() || 'Nunca'}</p>
    </div>
  );
}
```

---

## Diagramas de Sequência

### Diagrama 1: Fluxo Completo de Requisição

```
┌──────┐  ┌───────────┐  ┌─────────┐  ┌───────────┐  ┌──────────┐
│Client│  │EPGService │  │  Cache  │  │AllOrigins │  │meuguia.tv│
└──┬───┘  └─────┬─────┘  └────┬────┘  └─────┬─────┘  └────┬─────┘
   │            │             │             │             │
   │getChannelEPG('hbo')      │             │             │
   │───────────>│             │             │             │
   │            │             │             │             │
   │            │ check cache │             │             │
   │            │────────────>│             │             │
   │            │   MISS      │             │             │
   │            │<────────────│             │             │
   │            │             │             │             │
   │            │     GET /raw?url=...      │             │
   │            │────────────────────────────────────────>│
   │            │             │             │             │
   │            │             │       HTML response       │
   │            │<────────────────────────────────────────│
   │            │             │             │             │
   │            │ parse HTML  │             │             │
   │            │────────────>│             │             │
   │            │             │             │             │
   │            │ save cache  │             │             │
   │            │────────────>│             │             │
   │            │             │             │             │
   │            │notify listeners           │             │
   │            │──────┐      │             │             │
   │            │      │      │             │             │
   │            │<─────┘      │             │             │
   │            │             │             │             │
   │  ChannelEPG│             │             │             │
   │<───────────│             │             │             │
   │            │             │             │             │
```

### Diagrama 2: Background Loading

```
┌────────────┐  ┌───────────┐  ┌──────────────┐
│ App Init   │  │EPGService │  │  Network     │
└─────┬──────┘  └─────┬─────┘  └──────┬───────┘
      │               │               │
      │ fetchRealEPG()│               │
      │──────────────>│               │
      │               │               │
      │  true         │               │
      │<──────────────│               │
      │               │               │
      │               │ loadAllEPGInBackground()
      │               │──────┐        │
      │               │      │        │
      │               │      │ batch 1: fetch 3 channels
      │               │      │───────>│
      │               │      │        │
      │               │      │  wait 1s
      │               │      │───┐    │
      │               │      │   │    │
      │               │      │<──┘    │
      │               │      │        │
      │               │      │ batch 2: fetch 3 channels
      │               │      │───────>│
      │               │      │        │
      │               │      │  ...   │
      │               │      │        │
      │               │<─────┘        │
      │               │               │
      │               │ All done!     │
      │               │               │
```

---

## Considerações Técnicas

### Limitações
1. **Dependência de terceiros**: Depende do AllOrigins proxy e meuguia.tv
2. **Rate limiting**: Pode ser bloqueado se fizer muitas requisições
3. **Parsing frágil**: Mudanças no HTML do meuguia.tv podem quebrar o parser

### Melhorias Futuras Sugeridas
1. Implementar fallback para outros proxies CORS
2. Adicionar retry com exponential backoff
3. Persistir cache no localStorage
4. Implementar service worker para cache offline
5. Adicionar mais fontes de EPG como backup

### Performance
- Cache de 30 minutos reduz requisições
- Carregamento em lotes evita sobrecarga
- Deduplicação evita requisições duplicadas
- Sistema reativo atualiza UI eficientemente

---

## Estrutura de Tipos

```typescript
// types/epg.ts

interface Program {
  id: string;           // ID único do programa
  title: string;        // Título do programa
  description: string;  // Descrição (geralmente vazia)
  category: string;     // Categoria (ex: "Filme", "Série")
  startTime: Date;      // Horário de início
  endTime: Date;        // Horário de término
}

interface ChannelEPG {
  channelId: string;    // ID do canal
  programs: Program[];  // Lista de programas
}

interface CurrentProgram {
  current: Program;      // Programa atual
  next: Program | null;  // Próximo programa
  progress: number;      // Progresso 0-100
}
```
