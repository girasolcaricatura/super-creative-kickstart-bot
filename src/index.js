// Super Creative Kickstart — Slack bot en Cloudflare Workers
// Endpoints:
//   GET  /          -> health check
//   POST /kickstart -> recibe el slash command de Slack
//
// Variables de entorno (configuradas como Worker Secrets en el Dashboard):
//   ANTHROPIC_API_KEY
//   SLACK_BOT_TOKEN

const PROMPT_MAESTRO = `Eres el SUPER CREATIVE KICKSTART, una herramienta de ideación para creativos de agencias de experiential marketing, BTL y activaciones de marca. Tu rol es generar munición creativa — no propuestas terminadas, sino disparadores que abran posibilidades que el creativo no habría encontrado solo.

Cuando recibas un brief, genera el siguiente output completo:

## 1. LECTURA DEL BRIEF

Cuatro ángulos distintos del mismo brief:
- *Lo que dice:* qué pide literalmente el brief en 2 oraciones
- *Lo que quiere decir realmente:* qué busca la marca más allá de lo literal en 2 oraciones
- *Lo que no dice pero importa:* qué está implícito y es crítico en 2 oraciones
- *Lo que podría ser falso:* qué suposición del brief podría cuestionarse en 2 oraciones

## 2. UNIVERSOS SEMÁNTICOS

No generes los cruces. Despliega los dos universos para que el creativo los combine libremente.

*Universo A — [Marca]*
Lista abundante de todos los elementos concretos y culturalmente cargados asociados a la marca: objetos, valores, territorios, rituales, momentos, símbolos, campañas icónicas, tonos, arquetipos, sensaciones. Mínimo 35 elementos. Sin abstracciones vacías — solo cosas reconocibles como parte de ese universo de marca.

*Universo B — [Contexto/Evento/Target]*
Lista abundante de todos los elementos del contexto: lo que ocurre ahí, los universos culturales que lo rodean, las referencias del público, objetos, rituales, personajes, dinámicas, géneros, franquicias, sensaciones. Expándete hacia todo el ecosistema cultural. Investiga si es necesario. Mínimo 35 elementos.

## 3. TRIGGER CARDS

15 preguntas ¿Y si? específicas para ESTE brief. Solo la pregunta en negritas, sin explicación, sin subtítulo.

Organiza las 15 en 5 categorías de 3 cards cada una: Tiempo · Espacio · Usuario · Interacción · Contexto

## 4. POSIBILIDADES DE CONCEPTO

10 direcciones posibles. Cada una: nombre del concepto + la idea en 2 líneas. Inspira, no dicta. Sé atrevido.

## 5. BANCO DE LENGUAJE

16 copies o namings sin jerarquía. Mezcla español e inglés según el tono del brief.

## 6. PROMPTS DE IMAGEN

6 prompts para Midjourney o Gemini. Para cada uno: para qué sirve + el prompt completo listo para copiar.

## 7. REFERENCIAS

5 activaciones reales. Para cada una: por qué es relevante para ESTE brief + qué hicieron en 2 líneas + link.

REGLAS:
- Todo debe sentirse escrito para ESTE brief, nunca genérico
- Los universos semánticos deben ser abundantes y concretos
- Las trigger cards son solo la pregunta, sin explicación
- Los conceptos inspiran, no prescriben
- Nunca repitas triggers de otros briefs

BRIEF:
`;

// Sonnet 4 con 4000 tokens para output completo y de máxima calidad.
// Alternativa más barata si llegara a escalar mucho: "claude-haiku-4-5-20251001".
const ANTHROPIC_MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 4000;

async function callAnthropic(brief, apiKey) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: MAX_TOKENS,
      messages: [{ role: 'user', content: PROMPT_MAESTRO + brief }],
    }),
  });
  const data = await response.json();
  if (!data.content || !data.content[0]) {
    throw new Error('Respuesta inválida de Anthropic: ' + JSON.stringify(data));
  }
  return data.content[0].text;
}

async function postToSlack(channel, text, slackToken, thread_ts) {
  // Slack tiene límite de 3000 chars por mensaje — partimos en chunks
  const chunks = [];
  let current = '';
  for (const line of text.split('\n')) {
    if ((current + '\n' + line).length > 2800) {
      chunks.push(current);
      current = line;
    } else {
      current += (current ? '\n' : '') + line;
    }
  }
  if (current) chunks.push(current);

  for (const chunk of chunks) {
    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${slackToken}`,
      },
      body: JSON.stringify({
        channel,
        text: chunk,
        thread_ts,
        mrkdwn: true,
      }),
    });
  }
}

async function processKickstart(brief, channel_id, response_url, env) {
  try {
    const kickstart = await callAnthropic(brief, env.ANTHROPIC_API_KEY);
    await postToSlack(channel_id, kickstart, env.SLACK_BOT_TOKEN, null);
  } catch (err) {
    console.error('Error generando kickstart:', err);
    if (response_url) {
      await fetch(response_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `:warning: Error generando el kickstart: ${err.message}`,
        }),
      });
    }
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Health check
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
      return new Response('Super Creative Kickstart bot activo ✓\n', {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    // Slack slash command
    if (request.method === 'POST' && url.pathname === '/kickstart') {
      if (!env.ANTHROPIC_API_KEY || !env.SLACK_BOT_TOKEN) {
        return new Response(
          JSON.stringify({ text: 'Faltan secrets ANTHROPIC_API_KEY o SLACK_BOT_TOKEN' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const body = await request.text();
      const params = new URLSearchParams(body);
      const text = params.get('text') || '';
      const channel_id = params.get('channel_id');
      const user_name = params.get('user_name') || 'alguien';
      const response_url = params.get('response_url');
      const brief = text.trim() || 'Brief no proporcionado';

      // Trabajo en background — no bloquea la respuesta a Slack
      ctx.waitUntil(processKickstart(brief, channel_id, response_url, env));

      // Slack exige respuesta en <3s
      return new Response(
        JSON.stringify({
          response_type: 'in_channel',
          text: `:zap: *Super Creative Kickstart iniciado por @${user_name}*\nAnalizando el brief... esto tarda ~15-30 segundos.`,
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response('Not found', { status: 404 });
  },
};
