interface LanguageInfo {
  comment: string;
}

/**
 * Only the line-comment token per language is still needed (used to label
 * context and comment-hint lines in the prompt).
 */
export const LANGUAGE_MAP: Record<string, LanguageInfo> = {
  javascript:      { comment: '//' },
  typescript:      { comment: '//' },
  typescriptreact: { comment: '//' },
  javascriptreact: { comment: '//' },
  python:          { comment: '#' },
  go:              { comment: '//' },
  rust:            { comment: '//' },
  java:            { comment: '//' },
  c:               { comment: '//' },
  cpp:             { comment: '//' },
  csharp:          { comment: '//' },
  ruby:            { comment: '#' },
  php:             { comment: '//' },
  swift:           { comment: '//' },
  kotlin:          { comment: '//' },
  scala:           { comment: '//' },
  lua:             { comment: '--' },
  sql:             { comment: '--' },
};

export function isWhitespaceOrEmpty(text: string): boolean {
  return text.trim().length === 0;
}

export function isRepetitive(text: string): boolean {
  if (text.length < 10) return false;
  const trimmed = text.trim();
  const lines = trimmed.split('\n');

  if (lines.length >= 3) {
    const uniqueLines = new Set(lines.map(l => l.trim()));
    if (uniqueLines.size <= 1) return true;
  }

  const repeatPattern = /(.+?)\1{4,}/;
  if (repeatPattern.test(trimmed.replace(/\s/g, ''))) return true;

  const structureLines = lines.filter(l => l.trim().length > 0).map(l => l.trim().replace(/[a-zA-Z_$]\w*/g, 'x').replace(/[0-9]+/g, '0'));
  if (structureLines.length >= 3) {
    const uniqueStructures = new Set(structureLines);
    if (uniqueStructures.size <= 1) return true;
  }

  return false;
}
