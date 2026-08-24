const { generateChatCompletion } = require('../services/aiService');

const SYSTEM_PROMPT = `You are AgriBot, an AI assistant for AgriQueue — a Smart Crop Procurement Platform for Indian farmers.

Your role:
- Help farmers with questions about crop procurement, booking slots, queue management, market prices, government schemes, seeds, weather, transport, and payments.
- Answer in the EXACT SAME language the user speaks or writes in (Hindi, Telugu, Kannada, Tamil, Marathi, Odia, English, etc).
- Be warm, respectful, and use simple language a farmer can understand.
- Keep responses concise (2-4 sentences max) so they can be spoken aloud clearly.
- Never use markdown, bullet points, or special formatting.

CRITICAL: You must ALWAYS respond with a valid JSON object containing exactly two fields:
1. "reply": Your spoken response text in the user's language.
2. "lang": The BCP-47 language code of the user's language (e.g., "hi-IN", "en-US", "te-IN", "kn-IN", "ta-IN", "mr-IN", "or-IN").
Do NOT wrap the JSON in markdown code blocks.`;

const chatHistory = new Map();

// Cleanup stale sessions every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of chatHistory) {
    if (val._lastActivity && now - val._lastActivity > 30 * 60 * 1000) {
      chatHistory.delete(key);
    }
  }
}, 30 * 60 * 1000);

function getSmartFallbackReply(message) {
  const m = (message || '').toLowerCase();
  if (m.includes('slot') || m.includes('book') || m.includes('booking') || m.includes('टोकन') || m.includes('బుకింగ్')) {
    return {
      reply: 'You can book your procurement token by visiting the Book Slot page in the AgriQueue app, selecting your nearest mandi and date.',
      lang: 'en-US'
    };
  }
  if (m.includes('mandi') || m.includes('price') || m.includes('भाव') || m.includes('ధర')) {
    return {
      reply: 'Current crop MSP prices and real-time mandi rates are available on the Market Prices page with daily arrivals and trends.',
      lang: 'en-US'
    };
  }
  if (m.includes('scheme') || m.includes('yojana') || m.includes('योजना') || m.includes('పథకం')) {
    return {
      reply: 'You can explore central and state government schemes like PM-KISAN, KCC, and PM-KUSUM under the Schemes section with instant eligibility checks.',
      lang: 'en-US'
    };
  }
  return {
    reply: 'Namaste Kisan Bhai. I am AgriBot. You can ask me about mandi queues, slot booking, live crop market prices, or government farmer schemes.',
    lang: 'en-US'
  };
}

const aiAgentController = {
  async chat(req, res) {
    try {
      const { message, sessionId } = req.body;

      if (!message || !message.trim()) {
        return res.status(400).json({ error: 'Message is required.' });
      }

      const sid = sessionId || 'default';
      if (!chatHistory.has(sid)) {
        chatHistory.set(sid, []);
      }
      const history = chatHistory.get(sid);
      history._lastActivity = Date.now();

      if (history.length > 20) {
        history.splice(0, history.length - 20);
      }

      const messages = [];
      (history || []).forEach(h => {
        messages.push({
          role: h.role === 'model' || h.role === 'assistant' ? 'assistant' : 'user',
          content: h.parts?.[0]?.text || h.content || ''
        });
      });
      messages.push({ role: 'user', content: message.trim() });

      let parsed = null;

      try {
        const { text } = await generateChatCompletion({
          systemPrompt: SYSTEM_PROMPT,
          messages,
          temperature: 0.4,
          jsonMode: false
        });

        try {
          const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
          parsed = JSON.parse(cleaned);
        } catch (e) {
          parsed = { reply: text.replace(/[#*`]/g, '').trim(), lang: 'en-US' };
        }
      } catch (aiError) {
        console.warn('AI chat error, using smart fallback reply:', aiError.message);
        parsed = getSmartFallbackReply(message);
      }

      history.push({ role: 'user', parts: [{ text: message.trim() }] });
      history.push({ role: 'model', parts: [{ text: parsed.reply }] });

      return res.json({ reply: parsed.reply, lang: parsed.lang || 'en-US', sessionId: sid });
    } catch (error) {
      console.error('AI Agent Error:', error.message || error);
      res.status(500).json({ error: 'Failed to get AI response. ' + (error.message || 'Unknown error') });
    }
  }
};

module.exports = aiAgentController;

