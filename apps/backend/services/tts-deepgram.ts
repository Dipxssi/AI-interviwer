export async function synthesizeSpeech(text: string): Promise<Buffer> {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      throw new Error("Missing DEEPGRAM_API_KEY");
    }
  
    const url =
      "https://api.deepgram.com/v1/speak?model=aura-2-thalia-en&encoding=mp3";
  
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });
  
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Deepgram TTS failed: ${response.status} ${errText}`);
    }
  
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }