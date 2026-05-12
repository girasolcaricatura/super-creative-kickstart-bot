const express = require('express');
const fetch = require('node-fetch');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

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

async function callAnthropic(brief) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{ role: 'user', content: PROMPT_MAESTRO + brief }]
    })
  });
  const data = await response.json();
  return data.content[0].text;
}

async function postToSlack(channel, text, thread_ts) {
  // Slack tiene límite de 3000 chars por mensaje — dividimos en bloques
  const chunks = [];
  let current = '';
  const lines = text.split('\n');
  
  for (const line of lines) {
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
        'Authorization': `Bearer ${SLACK_BOT_TOKEN}`
      },
      body: JSON.stringify({
        channel,
        text: chunk,
        thread_ts,
        mrkdwn: true
      })
    });
  }
}

app.post('/kickstart', async (req, res) => {
  const { text, channel_id, user_name, response_url } = req.body;

  // Respuesta inmediata a Slack (tiene timeout de 3 segundos)
  res.json({
    response_type: 'in_channel',
    text: `⚡ *Super Creative Kickstart iniciado por @${user_name}*\nAnalizando el brief... esto tarda ~30 segundos.`
  });

  // Procesamos en background
  try {
    const brief = text || 'Brief no proporcionado';
    const kickstart = await callAnthropic(brief);
    await postToSlack(channel_id, kickstart, null);
  } catch (err) {
    await fetch(response_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: `Error generando el kickstart: ${err.message}` })
    });
  }
});

app.get('/', (req, res) => res.send('Super Creative Kickstart bot activo ✓'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
