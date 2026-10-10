/**
 * Cloudflare Worker — Gemini proxy (API key stays in Worker secrets)
 * Deploy: npx wrangler deploy
 * Secret: npx wrangler secret put GEMINI_API_KEY
 */
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '*';
    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method !== 'POST') {
      return json({ error: 'Only POST' }, 405, cors);
    }

    if (!env.GEMINI_API_KEY) {
      return json({ error: 'GEMINI_API_KEY not configured on Worker' }, 500, cors);
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: 'Invalid JSON' }, 400, cors);
    }

    const prompt = (body && body.prompt) || '';
    if (!prompt || prompt.length < 10) {
      return json({ error: 'prompt required' }, 400, cors);
    }
    if (prompt.length > 12000) {
      return json({ error: 'prompt too long' }, 400, cors);
    }

    const models = ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-flash-latest'];
    let lastErr = null;

    for (const model of models) {
      try {
        const url =
          'https://generativelanguage.googleapis.com/v1beta/models/' +
          model +
          ':generateContent?key=' +
          encodeURIComponent(env.GEMINI_API_KEY);

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          lastErr = (data.error && data.error.message) || ('HTTP ' + res.status);
          continue;
        }

        const parts =
          data.candidates &&
          data.candidates[0] &&
          data.candidates[0].content &&
          data.candidates[0].content.parts;
        if (!parts || !parts.length) {
          lastErr = 'empty response';
          continue;
        }

        const text = parts.map((p) => p.text || '').join('');
        return json({ text, model }, 200, cors);
      } catch (e) {
        lastErr = e.message || String(e);
      }
    }

    return json({ error: lastErr || 'all models failed' }, 502, cors);
  },
};

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors },
  });
}
