import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = {
  // Usar Edge Runtime para streaming real
  runtime: 'edge',
};

// Função para copiar os headers relevantes para o streaming
function copyStreamingHeaders(from: Headers, to: Headers) {
  const headersToCopy = [
    'content-type',
    'content-length',
    'content-range',
    'accept-ranges',
    'last-modified',
    'etag',
  ];
  for (const h of headersToCopy) {
    if (from.has(h)) {
      to.set(h, from.get(h)!);
    }
  }
}

export default async function handler(req: Request): Promise<Response> {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Range, Content-Type',
      },
    });
  }

  const url = new URL(req.url);
  const videoUrl = url.searchParams.get('url');

  if (!videoUrl) {
    return new Response(JSON.stringify({ error: 'URL parameter is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const decodedUrl = decodeURIComponent(videoUrl);
    
    if (!decodedUrl.startsWith('http://') && !decodedUrl.startsWith('https://')) {
      return new Response(JSON.stringify({ error: 'Invalid URL protocol' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const clientHeaders: Record<string, string> = {
      'User-Agent': req.headers.get('user-agent') || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': req.headers.get('referer') || '',
      'X-Forwarded-For': req.headers.get('x-forwarded-for') || '',
    };

    const rangeHeader = req.headers.get('range');
    if (rangeHeader) {
      clientHeaders['Range'] = rangeHeader;
    }
    
    // 1. Faz a primeira requisição sem seguir o redirect para capturar a URL final
    const firstResponse = await fetch(decodedUrl, {
      method: 'GET',
      headers: clientHeaders,
      redirect: 'manual', // Captura o redirect manualmente
    });

    let finalUrl = decodedUrl;
    const isRedirect = firstResponse.status >= 300 && firstResponse.status < 400;

    if (isRedirect && firstResponse.headers.has('location')) {
      // Se for redirect, pega a nova URL
      finalUrl = firstResponse.headers.get('location')!;
    } else if (!firstResponse.ok && firstResponse.status !== 206) {
      // Se não for redirect e der erro, retorna o erro
      return new Response(JSON.stringify({ 
        error: `Failed to fetch video (initial request): ${firstResponse.statusText}`,
        status: firstResponse.status
      }), {
        status: firstResponse.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. Faz a requisição final para a URL correta (a original ou a do redirect)
    const finalResponse = await fetch(finalUrl, {
      method: 'GET',
      headers: clientHeaders,
    });
    
    if (!finalResponse.ok && finalResponse.status !== 206) {
      return new Response(JSON.stringify({ 
        error: `Failed to fetch video (final request): ${finalResponse.statusText}`,
        status: finalResponse.status,
        url: finalUrl
      }), {
        status: finalResponse.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Criar headers da resposta para o cliente
    const responseHeaders = new Headers();
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', 'Range');
    responseHeaders.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
    
    // Copia os headers importantes da resposta final
    copyStreamingHeaders(finalResponse.headers, responseHeaders);

    // Retorna o stream do vídeo para o cliente
    return new Response(finalResponse.body, {
      status: finalResponse.status,
      headers: responseHeaders,
    });

  } catch (error) {
    console.error('Proxy error:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to proxy video',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
