const END_PATTERNS = [
  /\bend\s+(the\s+)?interview\b/i,
  /\bstop\s+(the\s+)?interview\b/i,
  /\bi('?m| am)\s+done\b/i,
  /\bwe('?re| are)\s+done\b/i,
  /\bthat('?s| is)\s+(all|it)\b/i,
  /\bno\s+more\s+questions\b/i,
  /\bi\s+want\s+to\s+(stop|end|finish)\b/i,
  /\blet('?s| us)\s+(stop|end|wrap\s*up)\b/i,
  /\bwrap\s*up\b/i,
  /\bfinish\s+(the\s+)?interview\b/i,
];

/** True when the candidate is asking to stop / wrap up. */
export function userWantsToEndInterview(text: string): boolean {
  const t = text.trim();
  if (!t || t === "[SESSION_START]") return false;
  return END_PATTERNS.some((re) => re.test(t));
}
