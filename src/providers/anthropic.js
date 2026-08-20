const Anthropic = require('@anthropic-ai/sdk');
const { buildSystemInstruction } = require('./prompt');

// Check ai docs.anthropic.com for the current model lineup.
const MODEL = 'claude-sonnet-5';

let client = null;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

// Every provider implements this same shape:
//   generateAnswer({ prompt, screenshotBase64, gameContext }) -> Promise<string>
async function generateAnswer({ prompt, screenshotBase64, gameContext }) {
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: buildSystemInstruction(gameContext),
    tools: [
      {
        type: 'web_search_20250305',
        name: 'web_search',
        // allowed_domains: ['ffxiv.consolegameswiki.com'],
      },
    ],
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: screenshotBase64 },
          },
        ],
      },
    ],
  });

  // Response may interleave text blocks with web_search_tool_result blocks;
  // only the text Claude actually wrote gets shown.
  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n\n');

  return text || '(no response)';
}

module.exports = { name: 'anthropic', generateAnswer };
