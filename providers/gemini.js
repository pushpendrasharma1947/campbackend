const axios = require('axios');

const API_KEY = process.env.AI_API_KEY;
const DEFAULT_MODEL = process.env.GENERATIVE_MODEL || 'chat-bison-001';

// messages: Array<{ role: 'user'|'assistant'|'system', content: string }>
async function generateReply(messages = [], opts = {}){
  if(!API_KEY) throw new Error('AI_API_KEY not set');

  const model = opts.model || DEFAULT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta2/models/${model}:generateMessage?key=${API_KEY}`;

  // Convert to a chat-style payload that Gemini accepts. We map roles to author and include text content.
  const msgPayload = messages.map(m => ({
    author: m.role,
    content: [ { type: 'text', text: m.content } ]
  }));

  const body = {
    messages: msgPayload,
    temperature: opts.temperature ?? 0.2,
    maxOutputTokens: opts.maxOutputTokens ?? 512
  };

  const resp = await axios.post(url, body, {
    headers: { 'Content-Type': 'application/json' }
  });

  // Try to extract a helpful text from usual response shapes
  try{
    // candidate content may be an array with text entries
    const candidate = resp.data && (resp.data.candidates || resp.data.outputs) && (resp.data.candidates || resp.data.outputs)[0];
    if(!candidate){
      // fallback: some responses place message.content
      const out = resp.data && resp.data.message && resp.data.message.content && resp.data.message.content[0];
      return (out && out.text) || JSON.stringify(resp.data);
    }

    // candidate may have 'output' or 'content'
    if(candidate.output) return candidate.output;
    if(candidate.content && Array.isArray(candidate.content)){
      const first = candidate.content.find(c => c.type === 'text');
      if(first) return first.text || first.text;
    }

    // generic string
    return JSON.stringify(candidate);
  }catch(err){
    throw new Error('Failed to parse AI response: ' + err.message);
  }
}

module.exports = { generateReply };
