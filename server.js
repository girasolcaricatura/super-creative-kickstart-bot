const express = require("express");

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const PROMPT_MAESTRO = `Eres el SUPER CREATIVE KICKSTART, una herramienta de ideación para creativos de agencias de experiential marketing, BTL y activaciones de marca. Tu rol es generar munición creativa, no propuestas terminadas, sino disparadores que abran posibilidades que el creativo no habría encontrado solo.

Cuando recibas un brief, genera el siguiente output completo:

## 1. LECTURA DEL BRIEF

Cuatro ángulos distintos del mismo brief:
- *Lo que dice:* qué pide literalmente el brief en 2 oraciones
- *Lo que quiere decir realmente:* qué busca la marca más allá de lo literal en 2 oraciones
- *Lo que no dice pero importa:* qué está implícito y es crítico en 2 oraciones
- *Lo que podría ser falso:* qué suposición del brief podría cuestionarse en 2 oraciones

## 2. UNIVERSOS SEMÁNTICOS

*Universo A — [Marca]*
Lista abundante de elementos concretos asociados a la marca. Mínimo 35 elementos.

*Universo B — [Contexto/Evento/Target]*
Lista abundante de elementos del contexto. Mínimo 35 elementos.

## 3. TRIGGER CARDS

15 preguntas ¿Y si? específicas para ESTE brief. Solo la pregunta en negritas.

Organiza en 5 categorías: Tiempo, Espacio, Usuario, Interacción, Contexto.

## 4. POSIBILIDADES DE CONCEPTO

10 direcciones posibles. Cada una: nombre del concepto + idea en 2 líneas.

## 5. BANCO DE LENGUAJE

16 copies o namings.

## 6. PROMPTS DE IMAGEN

6 prompts para Midjourney o Gemini. Para cada uno: para qué sirve + prompt completo.

## 7. REFERENCIAS

5 activaciones reales. Para cada una: por qué es relevante + qué hicieron + link.

REGLAS:
- Todo debe sentirse escrito para ESTE brief
- Nada genérico
- Sé útil, atrevido y concreto
- Escribe en español

BRIEF:
`;

function splitMessage(text, maxLength = 2800) {
  const chunks = [];
  let current = "";

  for (const line of text.split("\n")) {
    if ((current + "\n" + line).length > maxLength) {
      chunks.push(current);
      current = line;
    } else {
      current += (current ? "\n" : "") + line;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

async function sendToSlackResponseUrl(responseUrl, text) {
  const chunks = splitMessage(text);

  for (const chunk of chunks) {
    await fetch(responseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        response_type: "in_channel",
        text: chunk
      })
    });
  }
}

async function callAnthropic(brief) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("Falta ANTHROPIC_API_KEY en Railway Variables");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      messages: [
        {
          role: "user",
          content: PROMPT_MAESTRO + brief
        }
      ]
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || JSON.stringify(data));
  }

  if (!data.content || !data.content[0] || !data.content[0].text) {
    throw new Error("Claude respondió sin texto: " + JSON.stringify(data));
  }

  return data.content[0].text;
}

async function processKickstart({ brief, responseUrl }) {
  try {
    const kickstart = await callAnthropic(brief);
    await sendToSlackResponseUrl(responseUrl, kickstart);
  } catch (err) {
    console.error("Error generando kickstart:", err);

    await sendToSlackResponseUrl(
      responseUrl,
      `⚠️ Error generando el kickstart:\n${err.message}`
    );
  }
}

app.post("/kickstart", (req, res) => {
  const brief = req.body.text?.trim();
  const userName = req.body.user_name || "alguien";
  const responseUrl = req.body.response_url;

  if (!brief) {
    return res.json({
      response_type: "ephemeral",
      text:
        "Pásame el brief después del comando.\n\nEjemplo:\n/kickstart necesito una campaña para Miller High Life enfocada en vinyl collectors y golden hour"
    });
  }

  res.json({
    response_type: "in_channel",
    text: `⚡ *Super Creative Kickstart iniciado por @${userName}*\nAnalizando el brief... esto tarda ~30 segundos.`
  });

  processKickstart({ brief, responseUrl });
});

app.get("/", (req, res) => {
  res.send("Super Creative Kickstart bot activo ✓");
});

app.get("/health", (req, res) => {
  res.send("ok");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});