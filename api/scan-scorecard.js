// Vercel serverless function: securely proxies a scorecard photo to Claude's
// vision API using the ANTHROPIC_API_KEY stored as a Vercel secret.
// The key is NEVER exposed to the browser.

// Allow larger request bodies — phone photos (base64) can be a few MB.
export const config = {
  api: {
    bodyParser: { sizeLimit: "10mb" },
  },
};

export default async function handler(req, res) {
  // CORS / method guard
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  var apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Server is missing ANTHROPIC_API_KEY. Add it in Vercel project settings." });
    return;
  }

  try {
    var body = req.body;
    // Vercel may pass body as a string; parse if needed
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }

    var imageData = body && body.image;       // base64 string (no data: prefix)
    var mediaType = (body && body.mediaType) || "image/jpeg";
    var playerNames = (body && body.playerNames) || []; // optional hints

    if (!imageData) {
      res.status(400).json({ error: "No image provided." });
      return;
    }

    var hint = playerNames.length
      ? " The players on this card are likely: " + playerNames.join(", ") + "."
      : "";

    var prompt =
      "This is a photo of a golf scorecard. Extract each player's hole-by-hole scores." +
      hint +
      " Return ONLY valid JSON, no markdown, no backticks, no explanation. " +
      'Format exactly: {"players":[{"name":"PlayerName","scores":[4,5,3,4,4,5,3,4,5,4,4,3,4,5,4,4,3,4]}]}. ' +
      "Each scores array must have exactly 18 numbers (front 9 then back 9). " +
      "If a hole is blank or unreadable, use 0 for that hole. " +
      "If you cannot read a player's name, use Row 1, Row 2, etc.";

    var anthropicResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType, data: imageData },
              },
              { type: "text", text: prompt },
            ],
          },
        ],
      }),
    });

    if (!anthropicResp.ok) {
      var errText = await anthropicResp.text();
      res.status(502).json({ error: "Vision API error", detail: errText.slice(0, 300) });
      return;
    }

    var data = await anthropicResp.json();
    var text = "";
    if (data && data.content) {
      data.content.forEach(function (item) {
        if (item.type === "text") text += item.text;
      });
    }

    // Strip any stray markdown fences, then extract the JSON object
    var cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
    var match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) {
      res.status(422).json({ error: "Could not read the scorecard. Try a clearer, straight-on photo." });
      return;
    }

    var parsed;
    try {
      parsed = JSON.parse(match[0]);
    } catch (e) {
      res.status(422).json({ error: "Could not parse the scorecard. Try a clearer photo." });
      return;
    }

    res.status(200).json(parsed);
  } catch (err) {
    res.status(500).json({ error: "Scan failed", detail: String(err).slice(0, 200) });
  }
}
