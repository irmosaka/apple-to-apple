/**
 * Optional Cloudflare Worker proxy for Digikala MCP
 * Deploy: wrangler deploy (or paste in Cloudflare dashboard)
 *
 * Why use this?
 * - Cache responses briefly
 * - Hide upstream URL if needed
 * - Add your own rate limiting
 *
 * For the static Apple-to-Apple app, direct browser calls to
 * digikala-mcp already work (CORS *). This Worker is optional.
 */

const UPSTREAM = 'https://digikala-mcp.mmdju.workers.dev/mcp';

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders()
      });
    }

    if (request.method !== 'POST') {
      return json({ error: 'POST only' }, 405);
    }

    try {
      const body = await request.text();
      const upstream = await fetch(UPSTREAM, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept': 'application/json, text/event-stream'
        },
        body
      });

      const text = await upstream.text();
      return new Response(text, {
        status: upstream.status,
        headers: {
          ...corsHeaders(),
          'content-type': upstream.headers.get('content-type') || 'application/json'
        }
      });
    } catch (e) {
      return json({ error: String(e.message || e) }, 502);
    }
  }
};

function corsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400'
  };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders(), 'content-type': 'application/json' }
  });
}
