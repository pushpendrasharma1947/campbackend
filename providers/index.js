const gemini = require('./gemini');

const PROVIDER = process.env.GENERATIVE_PROVIDER || (process.env.AI_API_KEY ? 'gemini' : 'mock');

async function generateReply(messages, opts = {}){
  // messages expected to be an array of { role, content }
  if(PROVIDER === 'gemini'){
    return await gemini.generateReply(messages, opts);
  }

  // default mock: return a reply summarizing the last user message
  const lastUser = Array.isArray(messages) ? [...messages].reverse().find(m => m.role === 'user') : null;
  const text = lastUser ? `Mock reply: received (${lastUser.content.slice(0,200)})` : 'Mock reply: no conversation';
  return text;
}

module.exports = { generateReply };
