export const STOP_TOKENS = [
  '\n\n\n',
  '\r\n\r\n\r\n',
];

interface LanguageInfo {
  comment: string;
  stopTokens: string[];
  defaultMaxTokens: number;
}

export const LANGUAGE_MAP: Record<string, LanguageInfo> = {
  javascript:     { comment: '//', defaultMaxTokens: 768,  stopTokens: ['\nfunction ', '\nimport ', '\nexport ', '\nclass ', '\ninterface '] },
  typescript:     { comment: '//', defaultMaxTokens: 768,  stopTokens: ['\nfunction ', '\nimport ', '\nexport ', '\nclass ', '\ninterface ', '\ntype ', '\nenum '] },
  typescriptreact:{ comment: '//', defaultMaxTokens: 768,  stopTokens: ['\nfunction ', '\nimport ', '\nexport ', '\nclass ', '\ninterface '] },
  javascriptreact:{ comment: '//', defaultMaxTokens: 768,  stopTokens: ['\nfunction ', '\nimport ', '\nexport ', '\nclass '] },
  python:         { comment: '#', defaultMaxTokens: 1024, stopTokens: ['\nclass ', '\ndef ', '\nimport ', '\nfrom ', '\n"""'] },
  go:             { comment: '//', defaultMaxTokens: 384,  stopTokens: ['\nfunc ', '\npackage ', '\nimport ', '\ntype '] },
  rust:           { comment: '//', defaultMaxTokens: 384,  stopTokens: ['\nfn ', '\nstruct ', '\nenum ', '\nimpl ', '\nuse ', '\nmod ', '\npub '] },
  java:           { comment: '//', defaultMaxTokens: 512,  stopTokens: ['\npublic ', '\nprivate ', '\nprotected ', '\nclass ', '\ninterface ', '\nimport '] },
  c:              { comment: '//', defaultMaxTokens: 512,  stopTokens: ['\n#include ', '\n#define ', '\nstruct '] },
  cpp:            { comment: '//', defaultMaxTokens: 512,  stopTokens: ['\n#include ', '\n#define ', '\nclass ', '\ntemplate '] },
  csharp:         { comment: '//', defaultMaxTokens: 512,  stopTokens: ['\npublic ', '\nprivate ', '\nprotected ', '\nclass ', '\ninterface ', '\nnamespace ', '\nusing '] },
  ruby:           { comment: '#', defaultMaxTokens: 768,  stopTokens: ['\ndef ', '\nclass ', '\nmodule ', '\nrequire ', '\nend'] },
  php:            { comment: '//', defaultMaxTokens: 512,  stopTokens: ['\nfunction ', '\nclass ', '\nnamespace ', '\nuse '] },
  swift:          { comment: '//', defaultMaxTokens: 512,  stopTokens: ['\nfunc ', '\nclass ', '\nstruct ', '\nenum ', '\nimport '] },
  kotlin:         { comment: '//', defaultMaxTokens: 512,  stopTokens: ['\nfun ', '\nclass ', '\nobject ', '\nimport '] },
  scala:          { comment: '//', defaultMaxTokens: 512,  stopTokens: ['\ndef ', '\nclass ', '\nobject ', '\ntrait ', '\nimport '] },
  lua:            { comment: '--', defaultMaxTokens: 512,  stopTokens: ['\nfunction ', '\nlocal '] },
  sql:            { comment: '--', defaultMaxTokens: 256,  stopTokens: ['\nSELECT ', '\nFROM ', '\nWHERE ', '\nINSERT ', '\nUPDATE ', '\nDELETE ', '\nCREATE ', '\nALTER '] },
};

export function getLanguageDefaultMaxTokens(languageId: string): number {
  return LANGUAGE_MAP[languageId]?.defaultMaxTokens || 256;
}

export function getStopTokensForLanguage(languageId: string): string[] {
  const tokens: string[] = [...STOP_TOKENS];
  const langInfo = LANGUAGE_MAP[languageId];
  if (langInfo) {
    tokens.push(...langInfo.stopTokens);
  }
  return tokens;
}

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
