export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY is missing.');
    return res.status(500).json({ error: 'Sparky is not configured yet.' });
  }

  try {
    const { contents, systemInstruction } = req.body || {};

    if (!Array.isArray(contents) || contents.length === 0) {
      return res.status(400).json({ error: 'Missing conversation contents.' });
    }

    // Keep only valid Gemini conversation turns.
    const safeContents = contents
      .filter(turn => turn && (turn.role === 'user' || turn.role === 'model') && Array.isArray(turn.parts))
      .map(turn => ({
        role: turn.role,
        parts: turn.parts
          .filter(part => part && typeof part.text === 'string' && part.text.trim())
          .map(part => ({ text: part.text }))
      }))
      .filter(turn => turn.parts.length);

    // Gemini conversations should start with a user turn.
    while (safeContents.length && safeContents[0].role !== 'user') safeContents.shift();

    // Keep classroom requests lightweight to reduce rate-limit pressure.
    const recentContents = safeContents.slice(-6);

    if (!safeContents.length) {
      return res.status(400).json({ error: 'No valid user message was supplied.' });
    }

    const upstream = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          contents: recentContents,
          systemInstruction: {
            parts: [{ text: String(systemInstruction || '') }]
          },
          generationConfig: {
            maxOutputTokens: 450
          }
        })
      }
    );

    const data = await upstream.json();

    if (!upstream.ok) {
      console.error('Gemini API error:', JSON.stringify(data));

      if (upstream.status === 429) {
        return res.status(429).json({
          error: 'Sparky is busy right now. Please try again shortly.',
          retryAfterSeconds: 20
        });
      }

      return res.status(upstream.status).json({
        error: data?.error?.message || 'Gemini request failed.'
      });
    }

    const text = data?.candidates?.[0]?.content?.parts
      ?.map(part => part?.text)
      .filter(Boolean)
      .join('\n')
      .trim();

    if (!text) {
      console.error('Gemini returned no text:', JSON.stringify(data));
      return res.status(502).json({ error: 'Gemini returned no text.' });
    }

    return res.status(200).json({ text });
  } catch (error) {
    console.error('Sparky server error:', error);
    return res.status(500).json({ error: 'Sparky server error.' });
  }
}
