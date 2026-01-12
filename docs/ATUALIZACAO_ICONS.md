# Atualização dos Ícones dos Canais

## Data: Janeiro 2026

Este documento descreve as alterações realizadas nos ícones/logos dos canais de TV no arquivo `src/data/channels.ts`.

---

## 🔍 Problema Identificado

Alguns canais estavam sem ícones adequados ou com URLs que não existiam:

- **TV Gazeta** - URL inexistente no repositório tv-logos
- **Curta!** - Usando fallback com iniciais
- **AMC** - URL incorreta (amc-int.png não existe)
- **Combate** - URL inexistente
- **ESPN 2** - URL inexistente (espn-2-int.png)
- **ESPN 3** - URL inexistente (espn-3-int.png)
- **Nickelodeon** - URL inexistente no Brasil
- **Discovery Channel** - Usando versão internacional que não existia
- **Discovery H&H** - URL incorreta
- **Discovery Science** - URL incorreta
- **Discovery World** - URL inexistente
- **Food Network** - URL incorreta
- **History** - URL inexistente (history.png)
- **History 2** - URL inexistente (history-2.png)
- **Viva** - Usando fallback com iniciais

---

## 🔧 Metodologia de Correção

### 1. Pesquisa no Repositório tv-logo/tv-logos

O repositório [tv-logo/tv-logos](https://github.com/tv-logo/tv-logos) no GitHub é a fonte principal de logos de canais de TV. A estrutura do repositório é organizada por países/regiões:

```
tv-logos/
├── countries/
│   ├── brazil/                    # Canais brasileiros
│   ├── united-states/             # Canais americanos
│   ├── international/             # Canais internacionais
│   └── world-latin-america/       # Canais da América Latina
```

#### URLs Base Utilizadas:
```typescript
const LOGO_BASE = 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil';
const LOGO_INTL = 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/international';
const LOGO_US = 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states';
const LOGO_LAM = 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/world-latin-america';
```

### 2. Verificação de Existência das URLs

Para cada logo, foi verificado se a URL realmente existe usando:
```bash
curl -s -o /dev/null -w "%{http_code}" "URL_DO_LOGO"
```
- **200** = Logo existe ✅
- **404** = Logo não existe ❌

### 3. Fontes Alternativas

Para logos não encontrados no tv-logos, foi utilizado o **Wikimedia Commons** como fonte alternativa.

---

## 📝 Alterações Realizadas

### Canais com Logos do Repositório tv-logos

| Canal | URL Anterior | Nova URL | Fonte |
|-------|-------------|----------|-------|
| **AMC** | `international/amc-int.png` | `united-states/amc-us.png` | tv-logos (US) |
| **ESPN 2** | `international/espn-2-int.png` | `world-latin-america/espn-2-lam.png` | tv-logos (LAM) |
| **ESPN 3** | `international/espn-3-int.png` | `world-latin-america/espn-3-lam.png` | tv-logos (LAM) |
| **Nickelodeon** | `brazil/nickelodeon-br.png` | `world-latin-america/nickelodeon-lam.png` | tv-logos (LAM) |
| **Discovery Channel** | `international/discovery-channel-int.png` | `united-states/discovery-channel-us.png` | tv-logos (US) |
| **Discovery H&H** | `international/discovery-home-and-health-int.png` | `world-latin-america/discovery-home-and-health-lam.png` | tv-logos (LAM) |
| **Discovery Science** | `international/discovery-science-int.png` | `united-states/discovery-science-us.png` | tv-logos (US) |
| **Discovery World** | `international/discovery-world.png` | `united-states/discovery-history-us.png` | tv-logos (US) |
| **Food Network** | `international/food-network-int.png` | `united-states/food-network-us.png` | tv-logos (US) |
| **History** | `international/history.png` | `world-latin-america/history-channel-lam.png` | tv-logos (LAM) |
| **History 2** | `international/history-2.png` | `world-latin-america/history-channel-2-lam.png` | tv-logos (LAM) |
| **Combate** | `international/combate-int.png` | `united-states/ufc-us.png` | tv-logos (US) - Logo similar |

### Canais com Logos do Wikimedia Commons

Estes canais não tinham logos no repositório tv-logos, então foram buscados no Wikimedia Commons:

| Canal | Nova URL |
|-------|----------|
| **TV Gazeta** | `https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/TV_Gazeta.svg/500px-TV_Gazeta.svg.png` |
| **Curta!** | `https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Logo_of_Curta%21.svg/960px-Logo_of_Curta%21.svg.png` |
| **Viva** | `https://upload.wikimedia.org/wikipedia/commons/thumb/1/14/Canal_Viva_2018_wordmark.svg/960px-Canal_Viva_2018_wordmark.svg.png` |

---

## 🆕 Nova Constante Adicionada

Foi adicionada uma nova constante para logos da América Latina:

```typescript
const LOGO_LAM = 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/world-latin-america';
```

---

## 📊 Resultado Final

### Total de Canais Atualizados: **15**

- ✅ **12 canais** - Logos encontrados no repositório tv-logos
- ✅ **3 canais** - Logos encontrados no Wikimedia Commons
- ❌ **0 canais** - Usando fallback

### Fontes de Logos Utilizadas:

| Fonte | Quantidade | Canais |
|-------|------------|--------|
| tv-logos (Brazil) | Maioria | HBO, Telecine, Globo, etc. |
| tv-logos (US) | 6 | AMC, Discovery Channel, Discovery Science, Discovery World, Food Network, Combate |
| tv-logos (LAM) | 6 | ESPN 2, ESPN 3, Nickelodeon, Discovery H&H, History, History 2 |
| Wikimedia Commons | 3 | TV Gazeta, Curta!, Viva |

---

## 🔗 Links Úteis

- **Repositório tv-logos:** https://github.com/tv-logo/tv-logos
- **Wikimedia Commons:** https://commons.wikimedia.org/
- **Verificar logo Brasil:** https://github.com/tv-logo/tv-logos/tree/main/countries/brazil
- **Verificar logo LAM:** https://github.com/tv-logo/tv-logos/tree/main/countries/world-latin-america
- **Verificar logo US:** https://github.com/tv-logo/tv-logos/tree/main/countries/united-states

---

## 💡 Dicas para Futuras Atualizações

1. **Sempre verificar se a URL existe** antes de usar:
   ```bash
   curl -s -o /dev/null -w "%{http_code}" "URL"
   ```

2. **Ordem de busca recomendada:**
   - Brasil (`brazil/`)
   - América Latina (`world-latin-america/`)
   - Estados Unidos (`united-states/`)
   - Internacional (`international/`)
   - Wikimedia Commons (fallback)

3. **Para novos canais**, primeiro verificar se existe no tv-logos antes de criar fallback.

4. **Sistema de fallback** ainda disponível para emergências:
   ```typescript
   const getFallbackLogo = (name: string) => {
     const initials = name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
     return `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=8b5cf6&color=fff&size=128&bold=true&format=png`;
   };
   ```
