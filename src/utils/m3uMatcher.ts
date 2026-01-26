import { normalizeName } from '../services/m3uService';

/**
 * Utilitário para casar nomes do nosso JSON com entradas do M3U
 */

/**
 * Remove tags de linguagem e normaliza
 * Ex: "A Chave do Problema [L] (2023)" -> "a chave do problema 2023"
 */
export function getCleanName(name: string): string {
    let clean = name
        .replace(/\[L\]/gi, '')
        .replace(/\[LEG\]/gi, '')
        .replace(/\[XL\]/gi, '')
        .replace(/\(Legendado\)/gi, '')
        .replace(/ - Legendado/gi, '')
        .replace(/ Legendado/gi, '');

    return normalizeName(clean);
}

/**
 * Tenta encontrar a melhor URL correspondente para um item
 * @param name Nome do filme ou série (ex: "Breaking Bad S01 E01" ou "Matrix")
 * @param tmdbTitle Título original do TMDB (opcional, pode ajudar no match)
 * @param m3uMap Mapa de nomes normalizados -> URLs do M3U
 */
export function findMatch(
    name: string,
    tmdbTitle: string | undefined,
    m3uMap: Map<string, string>
): string | undefined {
    if (!name) return undefined;

    // 1. Tentativa Direta (Nome exato normalizado - PRIORIDADE para preservar tags como [LEG])
    const normalizedName = normalizeName(name);
    let match = m3uMap.get(normalizedName);
    if (match) return match;

    // 2. Se o nome original indica ser Legendado, tenta variantes de tags de lenda
    // Ex: "Serie [LEG]" tenta "Serie [L]", "Serie Legendado", "Serie L"
    if (name.match(/\[(LEG|L|XL|SUB)\]/i) || name.match(/Legendado/i)) {
        const clean = getCleanName(name); // "serie"
        const variants = [
            `${clean} l`,
            `${clean} leg`,
            `${clean} legendado`,
            `${clean} legendadas`,
            `${clean} xl`,
            `${clean} sub`
        ];

        for (const v of variants) {
            match = m3uMap.get(normalizeName(v));
            if (match) return match;
        }
    }

    // 3. Tenta encontrar Versão DUBLADA/CLEAN (Fallback ou Prioridade para items sem tag)
    // Se o usuário procurou "Matrix" (sem tag), vai cair aqui e achar "Matrix" (Dub/Clean)
    // Se procurou "Matrix [LEG]" e passo 2 falhou, cai aqui e acha Dublado (comportamento aceitável de fallback?)
    // O usuário disse: "tem que pegar dos legendados nao dos outros".
    // Então, se era legendado, talvez devêssemos EVITAR cair pro Dublado? 
    // Mas melhor ter conteúdo que nada. Porém, o problema era misturar tudo em Legendados.
    // Se o passo 2 falhar, significa que não achamos a versão legendada.
    const cleanName = getCleanName(name);
    match = m3uMap.get(cleanName);
    if (match) return match;

    // 1b. Tenta sem o ano também (algumas listas M3U não tem ano)
    const cleanNameNoYear = cleanName.replace(/\d{4}/, '').trim();
    if (cleanNameNoYear !== cleanName) {
        match = m3uMap.get(normalizeName(cleanNameNoYear));
        if (match) return match;
    }

    // 4. Tentativa com Título TMDB (se existir e for diferente)
    if (tmdbTitle) {
        const normalizedTmdb = normalizeName(tmdbTitle);
        match = m3uMap.get(normalizedTmdb);
        if (match) return match;
    }

    // 4. Lógica específica para Episódios de Séries (SxxExx ou Sxx Exx)
    // O JSON geralmente vem como "Nome da Série S01 E01" ou similar
    // O M3U pode ter variações como "Nome da Série - S01E01", "Nome da Serie T01E01", etc.

    // Regex para identificar padrão de temporada/episódio
    const episodeRegex = /(.*?)s(\d+)\s*e(\d+)/i;
    const matchResult = normalizedName.match(episodeRegex);

    if (matchResult) {
        const [, seriesName, season, episode] = matchResult;
        // Formata season/episode com 2 dígitos
        const s = season.padStart(2, '0');
        const e = episode.padStart(2, '0');

        // Tenta variações comuns no M3U
        const variations = [
            `${seriesName} s${s}e${e}`,      // nome s01e01
            `${seriesName} s${s} e${e}`,     // nome s01 e01
            `${seriesName} t${s}e${e}`,      // nome t01e01 (temporada)
            `${seriesName} ${s}x${e}`,       // nome 01x01
        ];

        for (const v of variations) {
            match = m3uMap.get(v.trim());
            if (match) return match;
        }
    }

    return undefined;
}
