const { buildSystemInstruction } = require('./prompt');

let _genaiModule = null;
async function getGenAI() {
  if (!_genaiModule) _genaiModule = await import('@google/genai');
  return _genaiModule;
}

// Check ai.google.dev for the current model lineup.
const MODEL = 'gemini-2.5-flash';

let client = null;
async function getClient() {
  if (!client) {
    const { GoogleGenAI } = await getGenAI();
    client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return client;
}

// Same interface as providers/anthropic.js:
//   generateAnswer({ prompt, screenshotBase64, gameContext }) -> Promise<string>
async function generateAnswer({ prompt, screenshotBase64, gameContext }) {
  const ai = await getClient();
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          { inlineData: { mimeType: 'image/png', data: screenshotBase64 } },
        ],
      },
    ],
    config: {
      systemInstruction: buildSystemInstruction(gameContext),
      // Note: the Gemini API doesn't currently allow mixing googleSearch
      // with other tool types (e.g. function calling) in one request.
      tools: [{ googleSearch: {} }],
    },
  });

  return response.text || '(no response)';
}

module.exports = { name: 'gemini', generateAnswer };
