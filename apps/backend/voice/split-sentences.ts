export function splitIntoSentences(text: string): string[] {
    const trimmed = text.trim();
    if (!trimmed) return [];
  
    const parts = trimmed.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
    return (parts ?? [trimmed]).map((s) => s.trim()).filter(Boolean);
  }