export type AsrResult = {
    transcript: string;
    confidence: number | null;
  };
  
  export async function transcribeAudio(
    audio: Buffer,
    mimeType = "audio/wav",
  ): Promise<AsrResult> {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      throw new Error("Missing DEEPGRAM_API_KEY");
    }
  
    const url =
      "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true";
  
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": mimeType,
      },
      body: new Uint8Array(audio),
    });
  
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Deepgram ASR failed: ${response.status} ${errText}`);
    }
  
    const data = (await response.json()) as {
      results?: {
        channels?: Array<{
          alternatives?: Array<{
            transcript?: string;
            confidence?: number;
          }>;
        }>;
      };
    };
  
    const alt = data.results?.channels?.[0]?.alternatives?.[0];
    const transcript = alt?.transcript?.trim() ?? "";
  
    if (!transcript) {
      throw new Error("Deepgram returned empty transcript");
    }
  
    return {
      transcript,
      confidence: alt?.confidence ?? null,
    };
  }
  