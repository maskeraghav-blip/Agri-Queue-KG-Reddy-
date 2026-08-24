const { analyzeImage } = require('../services/aiService');

const doctorController = {
  async analyze(req, res) {
    try {
      const { base64Image, mimeType } = req.body;

      if (!base64Image) {
        return res.status(400).json({ error: 'Image data is required.' });
      }

      console.log('[AI Doctor] ── Image received from frontend ──');
      console.log(`[AI Doctor] mimeType: ${mimeType || 'image/jpeg'}`);
      console.log(`[AI Doctor] base64 length: ${base64Image.length} chars`);

      // Two-step prompt: FIRST classify if agricultural, THEN diagnose
      const prompt = `You are an expert agricultural AI doctor and image classifier.

STEP 1 — CLASSIFICATION:
First, determine whether this image contains an agricultural subject such as:
a plant, crop, leaf, flower, fruit, vegetable, stem, root, seed, pest, insect on a plant, soil with crops, agricultural field, farm produce, or any agriculture-related subject.

STEP 2 — RESPONSE:
Based on your classification, respond with ONLY a valid JSON object (no markdown, no backticks):

If the image is NOT agriculture-related (e.g. it shows a person, car, building, animal, text, electronics, etc.):
{
  "is_plant": false,
  "disease": "Not an Agricultural Image",
  "confidence": "N/A",
  "crop": "N/A",
  "recommendation": "This image does not appear to contain a plant or agricultural subject. Please upload a clear image of a crop, leaf, fruit, stem, or pest for diagnosis."
}

If the image IS agriculture-related, analyze for diseases, pests, or deficiencies:
{
  "is_plant": true,
  "disease": "Name of the disease or 'Healthy'",
  "confidence": "Percentage (e.g., '95%')",
  "crop": "Name of the crop identified",
  "recommendation": "Detailed actionable treatment or prevention advice for Indian farmers."
}

IMPORTANT: Return ONLY the raw JSON object. No markdown code blocks. No explanation outside the JSON.`;

      console.log('[AI Doctor] Sending image to AI service for analysis...');

      let parsed = null;

      try {
        const { text, provider, model } = await analyzeImage({
          prompt,
          base64Image,
          mimeType: mimeType || 'image/jpeg'
        });

        console.log(`[AI Doctor] ✅ AI response received from ${provider} (${model})`);
        console.log(`[AI Doctor] Raw AI response (first 500 chars): ${text.substring(0, 500)}`);

        // Clean markdown artifacts and parse JSON
        let cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
        
        // Handle cases where model wraps in extra text before/after JSON
        const jsonStart = cleaned.indexOf('{');
        const jsonEnd = cleaned.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
          cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
        }

        parsed = JSON.parse(cleaned);
        console.log(`[AI Doctor] ✅ Parsed result: is_plant=${parsed.is_plant}, disease="${parsed.disease}", crop="${parsed.crop}"`);

      } catch (aiErr) {
        console.error('[AI Doctor] ❌ AI analysis failed:', aiErr.message);
        console.error('[AI Doctor] This means the image NEVER reached an AI model that could process it.');

        // Return an honest error — NOT a fake plant diagnosis
        parsed = {
          is_plant: null,
          disease: 'AI Service Unavailable',
          confidence: 'N/A',
          crop: 'Unknown',
          recommendation: 'The AI analysis service is currently unavailable. Please check that GROQ_API_KEY is valid in server/.env and that vision-capable models are accessible. Try again in a moment.'
        };
      }

      return res.json(parsed);
    } catch (error) {
      console.error('[AI Doctor] ❌ Unhandled error:', error);
      res.status(500).json({ error: 'Failed to analyze the image. ' + (error.message || '') });
    }
  }
};

module.exports = doctorController;
