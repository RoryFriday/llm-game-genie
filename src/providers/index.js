// Add a new backend by dropping a module in this directory with the same
// { name, generateAnswer } shape and registering it below - nothing
// outside this file needs to know it exists.
const registry = {
  anthropic: () => require('./anthropic'),
  gemini: () => require('./gemini'),
};

let active = null;

function getProvider() {
  if (active) return active;

  const key = (process.env.LLM_PROVIDER || 'gemini').toLowerCase();
  const load = registry[key];
  if (!load) {
    throw new Error(
      `Unknown LLM_PROVIDER "${key}". Valid options: ${Object.keys(registry).join(', ')}`
    );
  }

  active = load();
  return active;
}

// The one thing the rest of the app calls. Swapping providers is an env
// var change (LLM_PROVIDER=anthropic|gemini), not a code change.
async function generateAnswer(args) {
  return getProvider().generateAnswer(args);
}

module.exports = { generateAnswer, getProvider };
