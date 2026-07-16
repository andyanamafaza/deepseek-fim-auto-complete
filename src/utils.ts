export const STOP_TOKENS = [
  '\n\n\n',
  '\r\n\r\n\r\n',
];

interface LanguageInfo {
  comment: string;
  stopTokens: string[];
}

export const LANGUAGE_MAP: Record<string, LanguageInfo> = {
  javascript: { comment: '//', stopTokens: ['\nfunction ', '\nconst ', '\nlet ', '\nvar ', '\nimport ', '\nexport ', '\nclass ', '\ninterface '] },
  typescript: { comment: '//', stopTokens: ['\nfunction ', '\nconst ', '\nlet ', '\nvar ', '\nimport ', '\nexport ', '\nclass ', '\ninterface ', '\ntype ', '\nenum '] },
  typescriptreact: { comment: '//', stopTokens: ['\nfunction ', '\nconst ', '\nimport ', '\nexport ', '\nclass ', '\ninterface '] },
  javascriptreact: { comment: '//', stopTokens: ['\nfunction ', '\nconst ', '\nimport ', '\nexport ', '\nclass '] },
  python: { comment: '#', stopTokens: ['\nclass ', '\ndef ', '\n# ', '\nimport ', '\nfrom ', '\n@', '\n"""'] },
  go: { comment: '//', stopTokens: ['\nfunc ', '\npackage ', '\nimport ', '\ntype ', '\nconst ', '\nvar ', '\nif ', '\nfor '] },
  rust: { comment: '//', stopTokens: ['\nfn ', '\nstruct ', '\nenum ', '\nimpl ', '\nuse ', '\nmod ', '\npub ', '\nlet ', '\nmut '] },
  java: { comment: '//', stopTokens: ['\npublic ', '\nprivate ', '\nprotected ', '\nclass ', '\ninterface ', '\nimport ', '\nvoid ', '\nint ', '\nString ', '@'] },
  c: { comment: '//', stopTokens: ['\n#include ', '\n#define ', '\nint ', '\nvoid ', '\nchar ', '\nstruct ', '\nif ', '\nfor ', '\nwhile '] },
  cpp: { comment: '//', stopTokens: ['\n#include ', '\n#define ', '\nint ', '\nvoid ', '\nchar ', '\nstruct ', '\nclass ', '\npublic:', '\nprivate:', '\ntemplate '] },
  csharp: { comment: '//', stopTokens: ['\npublic ', '\nprivate ', '\nprotected ', '\nclass ', '\ninterface ', '\nnamespace ', '\nusing ', '\nvoid ', '\nint ', '\nstring ', '\nvar '] },
  ruby: { comment: '#', stopTokens: ['\ndef ', '\nclass ', '\nmodule ', '\nrequire ', '\nif ', '\nunless ', '\nend'] },
  php: { comment: '//', stopTokens: ['\nfunction ', '\nclass ', '\nnamespace ', '\nuse ', '\npublic ', '\nprivate ', '\nprotected ', '\nif ', '\nforeach '] },
  swift: { comment: '//', stopTokens: ['\nfunc ', '\nclass ', '\nstruct ', '\nenum ', '\nimport ', '\nvar ', '\nlet ', '\nif '] },
  kotlin: { comment: '//', stopTokens: ['\nfun ', '\nclass ', '\nobject ', '\nimport ', '\nval ', '\nvar ', '\nif ', '\nwhen '] },
  scala: { comment: '//', stopTokens: ['\ndef ', '\nclass ', '\nobject ', '\ntrait ', '\nimport ', '\nval ', '\nvar ', '\nif '] },
  lua: { comment: '--', stopTokens: ['\nfunction ', '\nlocal ', '\nif ', '\nfor ', '\nwhile ', '\nend'] },
  sql: { comment: '--', stopTokens: ['\nSELECT ', '\nFROM ', '\nWHERE ', '\nINSERT ', '\nUPDATE ', '\nDELETE ', '\nCREATE ', '\nALTER '] },
};

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
  const lines = text.trim().split('\n');
  if (lines.length < 3) return false;
  const uniqueLines = new Set(lines.map(l => l.trim()));
  return uniqueLines.size <= 1;
}
