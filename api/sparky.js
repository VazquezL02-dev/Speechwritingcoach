export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not configured in Vercel.' });
  }

  try {
    const { contents, systemInstruction } = req.body || {};
    if (!Array.isArray(contents) || contents.length === 0) {
      return res.status(400).json({ error: 'Missing conversation contents.' });
    }

    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          systemInstruction: { parts: [{ text: String(systemInstruction || '') }] },
          generationConfig: {
            temperature: 0.65,
            maxOutputTokens: 500
          }
        })
      }
    );

    const data = await upstream.json();
    if (!upstream.ok) {
      console.error('Gemini API error:', data);
      return res.status(upstream.status).json({ error: data?.error?.message || 'Gemini request failed.' });
    }

    const text = data?.candidates?.[0]?.content?.parts
      ?.map(part => part?.text)
      .filter(Boolean)
      .join('\n')
      .trim();

    if (!text) return res.status(502).json({ error: 'Gemini returned no text.' });
    return res.status(200).json({ text });
  } catch (error) {
    console.error('Sparky server error:', error);
    return res.status(500).json({ error: 'Sparky server error.' });
  }
}
