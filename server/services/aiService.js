const Groq = require('groq-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * Unified AI service supporting Groq (primary) and Google Gemini fallback.
 * Handles text chat and image analysis with robust model cascading.
 */

function getGroqClient() {
  const apiKey = process.env.GROQ_API_KEY;
  if (apiKey && apiKey.startsWith('gsk_') && apiKey.length > 20) {
    return new Groq({ apiKey });
  }
  return null;
}

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey && apiKey.length > 10) {
    return new GoogleGenerativeAI(apiKey);
  }
  return null;
}

// Models confirmed available on current API key via groq.models.list()
const GROQ_TEXT_MODELS = [
  'openai/gpt-oss-120b',
  'qwen/qwen3.6-27b',
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'mixtral-8x7b-32768',
  'gemma2-9b-it'
];

const GROQ_VISION_MODELS = [
  'llama-3.2-90b-vision-preview',
  'llama-3.2-11b-vision-preview'
];

const GEMINI_TEXT_MODELS = [
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-flash-latest'
];

const GEMINI_VISION_MODELS = [
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-pro'
];

/**
 * Generate a text chat completion via Groq (primary) → Gemini (fallback).
 */
async function generateChatCompletion({ systemPrompt, messages, temperature = 0.5, jsonMode = false }) {
  const groq = getGroqClient();
  let lastError = null;

  // 1. Try Groq text models
  if (groq) {
    for (const model of GROQ_TEXT_MODELS) {
      try {
        const formattedMessages = [];
        if (systemPrompt) {
          formattedMessages.push({ role: 'system', content: systemPrompt });
        }
        for (const m of messages) {
          formattedMessages.push({
            role: m.role === 'model' || m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content || m.text || ''
          });
        }

        const options = {
          model,
          messages: formattedMessages,
          temperature
        };
        if (jsonMode) {
          options.response_format = { type: 'json_object' };
        }

        console.log(`[AI Service] Trying Groq text model: ${model}`);
        const completion = await groq.chat.completions.create(options);
        const reply = completion.choices[0]?.message?.content;
        if (reply) {
          console.log(`[AI Service] ✅ Groq text model ${model} succeeded (${reply.length} chars)`);
          return { text: reply, provider: 'groq', model };
        }
      } catch (err) {
        lastError = err;
        console.warn(`[AI Service] ❌ Groq text model ${model} error:`, err.message || err);
      }
    }
  }

  // 2. Try Gemini text models fallback
  const gemini = getGeminiClient();
  if (gemini) {
    for (const modelName of GEMINI_TEXT_MODELS) {
      try {
        const model = gemini.getGenerativeModel({
          model: modelName,
          ...(systemPrompt ? { systemInstruction: { parts: [{ text: systemPrompt }] } } : {})
        });

        const contents = [];
        for (const m of messages) {
          contents.push({
            role: m.role === 'model' || m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content || m.text || '' }]
          });
        }

        console.log(`[AI Service] Trying Gemini text model: ${modelName}`);
        const result = await model.generateContent({ contents });
        const res = await result.response;
        const reply = res.text();
        if (reply) {
          console.log(`[AI Service] ✅ Gemini text model ${modelName} succeeded (${reply.length} chars)`);
          return { text: reply, provider: 'gemini', model: modelName };
        }
      } catch (err) {
        lastError = err;
        console.warn(`[AI Service] ❌ Gemini text model ${modelName} error:`, err.message || err);
      }
    }
  }

  throw lastError || new Error('No AI provider available or all requests failed.');
}

/**
 * Analyze an image using vision-capable models.
 * Strategy: Try Groq vision models → Gemini vision → Groq text model with base64 description.
 * The last fallback sends the image as a base64 data URL string described in the prompt,
 * which won't give true vision but at least reaches the AI with context.
 */
async function analyzeImage({ prompt, base64Image, mimeType = 'image/jpeg' }) {
  const cleanB64 = base64Image.replace(/^data:image\/\w+;base64,/, '');
  const dataUrl = `data:${mimeType};base64,${cleanB64}`;
  const groq = getGroqClient();
  let lastError = null;

  console.log(`[AI Service] analyzeImage called. Image size: ${cleanB64.length} chars base64, mimeType: ${mimeType}`);

  // 1. Try Groq Vision models (multimodal content array)
  if (groq) {
    for (const model of GROQ_VISION_MODELS) {
      try {
        console.log(`[AI Service] Trying Groq vision model: ${model}`);
        const completion = await groq.chat.completions.create({
          model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                {
                  type: 'image_url',
                  image_url: { url: dataUrl }
                }
              ]
            }
          ],
          temperature: 0.2
        });

        const reply = completion.choices[0]?.message?.content;
        if (reply) {
          console.log(`[AI Service] ✅ Groq vision model ${model} succeeded (${reply.length} chars)`);
          return { text: reply, provider: 'groq', model };
        }
      } catch (err) {
        lastError = err;
        console.warn(`[AI Service] ❌ Groq vision model ${model} error:`, err.message || err);
      }
    }
  }

  // 2. Try Gemini Vision models
  const gemini = getGeminiClient();
  if (gemini) {
    for (const modelName of GEMINI_VISION_MODELS) {
      try {
        console.log(`[AI Service] Trying Gemini vision model: ${modelName}`);
        const model = gemini.getGenerativeModel({ model: modelName });
        const imageParts = [
          {
            inlineData: {
              data: cleanB64,
              mimeType
            }
          }
        ];
        const result = await model.generateContent([prompt, ...imageParts]);
        const response = await result.response;
        const text = response.text();
        if (text) {
          console.log(`[AI Service] ✅ Gemini vision model ${modelName} succeeded (${text.length} chars)`);
          return { text, provider: 'gemini', model: modelName };
        }
      } catch (err) {
        lastError = err;
        console.warn(`[AI Service] ❌ Gemini vision model ${modelName} error:`, err.message || err);
      }
    }
  }

  // 3. Last resort: Send image as base64 data URL to a text model.
  //    Some text models can handle base64 image URLs in content arrays.
  //    If the model doesn't support it, it will at least get the prompt text.
  if (groq) {
    for (const model of GROQ_TEXT_MODELS) {
      try {
        console.log(`[AI Service] Trying Groq text model as vision fallback: ${model}`);

        // Attempt multimodal content array format with text model
        const completion = await groq.chat.completions.create({
          model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                {
                  type: 'image_url',
                  image_url: { url: dataUrl }
                }
              ]
            }
          ],
          temperature: 0.2
        });

        const reply = completion.choices[0]?.message?.content;
        if (reply) {
          console.log(`[AI Service] ✅ Text model ${model} with image content succeeded (${reply.length} chars)`);
          return { text: reply, provider: 'groq', model };
        }
      } catch (err) {
        // If multimodal content array doesn't work, try plain text with image description
        console.warn(`[AI Service] ❌ Text model ${model} multimodal failed:`, err.message || err);

        try {
          // Send as plain string prompt — the model won't see the image but will
          // get the prompt. This lets us at least return a "cannot analyze" response
          // rather than a fake plant diagnosis.
          const plainPrompt = prompt + '\n\n[NOTE: An image was uploaded but could not be processed by the current AI model. Based on the prompt context alone, provide an appropriate response. If you cannot analyze an actual image, state that clearly.]';
          
          const completion = await groq.chat.completions.create({
            model,
            messages: [{ role: 'user', content: plainPrompt }],
            temperature: 0.2
          });

          const reply = completion.choices[0]?.message?.content;
          if (reply) {
            console.log(`[AI Service] ✅ Text model ${model} plain-text fallback succeeded (${reply.length} chars)`);
            return { text: reply, provider: 'groq-text-fallback', model };
          }
        } catch (err2) {
          lastError = err2;
          console.warn(`[AI Service] ❌ Text model ${model} plain fallback also failed:`, err2.message || err2);
        }
      }
    }
  }

  throw lastError || new Error('No AI vision provider available. Neither Groq vision, Gemini vision, nor text-model fallback succeeded.');
}

module.exports = {
  generateChatCompletion,
  analyzeImage,
  getGroqClient,
  getGeminiClient
};
