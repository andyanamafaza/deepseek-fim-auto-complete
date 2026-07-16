# DeepSeek Autocomplete

[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code-Marketplace-blue)](https://marketplace.visualstudio.com/items?itemName=andyanamafaza.deepseek-fim-auto-complete)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

**AI-powered code completions** for VS Code using DeepSeek's Fill-in-the-Middle API.  
Smart, multi-line inline suggestions for 14+ languages — works like Copilot, powered by DeepSeek.

---

## Features

- **Multi-line ghost text** — suggests full functions, blocks, and expressions, not just single lines
- **Context-aware** — understands prefix (before cursor) and suffix (after cursor) via FIM
- **Streaming** — tokens arrive as generated, no waiting for full response
- **Smart multi-line detection** — auto-triggers after `def`, `class`, `if`, `{`, `:`, `(`, and more
- **Multi-model support** — switch between `v4-flash` (fast) and `v4-pro` (quality) with one click
- **LRU cache** — repeated patterns complete instantly
- **Sensitive file filter** — skips `.env`, secrets, credentials; custom glob patterns
- **Usage statistics** — tracks shown/accepted completions, tokens used, estimated cost
- **Secure API key storage** — stored in OS keychain via `SecretStorage`, never in settings files
- **14+ languages** — JavaScript, TypeScript, Python, Java, Go, Rust, C/C++, C#, Ruby, PHP, Swift, Kotlin, Scala, Lua, SQL

## Requirements

- [VS Code](https://code.visualstudio.com/) 1.68+
- [DeepSeek API key](https://platform.deepseek.com/api_keys) (free credits available)

## Quick Start

### 1. Set your API key
```
Ctrl+Shift+P → DeepSeek Autocomplete: Set API Key
```
Paste your key — it's masked and stored securely in your OS keychain.

### 2. Start coding
Open any supported file. Ghost text appears inline as you type.

### Controls

| Key | Action |
|-----|--------|
| `Tab` | Accept completion |
| `Escape` | Dismiss |
| `Ctrl+Shift+.` | Toggle on/off |
| `Ctrl+Right` | Accept word-by-word |
| `Ctrl+Space` | Show 3 alternative completions |

### Commands

| Command | Description |
|---------|-------------|
| `DeepSeek Autocomplete: Set API Key` | Store API key in OS keychain (masked) |
| `DeepSeek Autocomplete: Delete API Key` | Remove stored key |
| `DeepSeek Autocomplete: Select Model` | Switch between flash/pro/legacy |
| `DeepSeek Autocomplete: Set Temperature` | Quick-pick from 8 levels (0.0–1.0) |
| `DeepSeek Autocomplete: Set Max Tokens` | Quick-pick from 64–2048 |
| `DeepSeek Autocomplete: Toggle` | Enable/disable |
| `DeepSeek Autocomplete: Usage Statistics` | View shown/accepted/tokens cost |
| `DeepSeek Autocomplete: Debug Log` | Open debug output channel |

## Configuration

All settings are under `deepseekFim.*` (`Ctrl+,` → search "deepseek").

### Essential

| Setting | Default | Description |
|---------|---------|-------------|
| `deepseekFim.model` | `deepseek-v4-flash` | Model: `flash` (fast) or `pro` (quality) |
| `deepseekFim.enabled` | `true` | Master toggle |
| `deepseekFim.triggerMode` | `automatic` | `automatic` = while typing, `manual` = only on `Ctrl+Space` |
| `deepseekFim.multilineCompletions` | `auto` | `auto`, `always`, or `never` |

### Performance

| Setting | Default | Description |
|---------|---------|-------------|
| `deepseekFim.debounceMs` | 300 | Delay before requesting while typing |
| `deepseekFim.maxTokens` | 256 | Max tokens (auto-bumps to 1024 for multi-line) |
| `deepseekFim.temperature` | 0.0 | 0 = deterministic, higher = more creative |
| `deepseekFim.streamingTimeout` | 500 | Single-line early-break timeout in ms |
| `deepseekFim.cacheSize` | 500 | LRU cache entries (0 = disabled) |

### Context

| Setting | Default | Description |
|---------|---------|-------------|
| `deepseekFim.maxPrefixChars` | 6000 | Max chars before cursor as prompt |
| `deepseekFim.maxSuffixChars` | 2000 | Max chars after cursor as suffix |
| `deepseekFim.baseUrl` | `https://api.deepseek.com/beta` | Custom API endpoint |
| `deepseekFim.timeoutMs` | 10000 | HTTP request timeout |

### Advanced

| Setting | Default | Description |
|---------|---------|-------------|
| `deepseekFim.stopSequences` | `[]` | Custom stop sequences (appended to defaults) |
| `deepseekFim.disableInFiles` | `[]` | Glob patterns to skip (e.g. `**/*.min.js`) |
| `deepseekFim.debug` | `false` | Verbose logging to output channel |
| `deepseekFim.snippetSupport` | `false` | Enable `SnippetString` tab stops (`$1`) |

### JSON example

```json
{
  "deepseekFim.model": "deepseek-v4-pro",
  "deepseekFim.temperature": 0.2,
  "deepseekFim.maxTokens": 1024,
  "deepseekFim.multilineCompletions": "auto",
  "deepseekFim.disableInFiles": ["**/*.json", "**/secret*"],
  "deepseekFim.debug": true
}
```

## Privacy & Security

- **API key** stored in OS keychain via VS Code [`SecretStorage`](https://code.visualstudio.com/api/references/vscode-api#SecretStorage) — never in settings, files, or logs
- **All API requests** over HTTPS — encrypted in transit
- **Sensitive files** (`.env`, `*secret*`, `*credential*`, `*password*`, `*.pem`, `*.key`, etc.) are skipped automatically
- **No telemetry** — the extension does not collect usage data or phone home
- **Prompts** are sent to DeepSeek API only when generating completions. You control what's sent.

## Development

```bash
git clone https://github.com/andyanamafaza/deepseek-fim-auto-complete.git
cd deepseek-fim-auto-complete
npm install
npm run compile
```

Press `F5` in VS Code to launch an Extension Development Host.

### Scripts

| Script | Description |
|--------|-------------|
| `npm run compile` | TypeScript compile |
| `npm run watch` | Watch mode |
| `npm run lint` | TypeScript + ESLint |
| `npm test` | E2E tests |
| `npm run vscode:prepublish` | ESBuild production bundle |

### Packaging

```bash
npx vsce package
code --install-extension deepseek-fim-auto-complete-*.vsix
```

## How it works

1. You pause typing → VS Code calls `provideInlineCompletionItems`
2. The extension extracts **prefix** (code before cursor) and **suffix** (code after cursor)
3. A context header (`// File: foo.py\n// Language: python`) is prepended
4. The request streams to DeepSeek's FIM API via HTTPS
5. For **single-line** contexts: response is cut early at complete statements (`;`, `}`, length)
6. For **multi-line** contexts (after `def`, `class`, `if`, `{`, etc.): response waits for full block completion using `\n\n\n\n` stop token
7. The completion is cached and returned as ghost text

## FAQ

**Q: Why multi-line isn't showing up?**  
A: Ensure `deepseekFim.multilineCompletions` is set to `"auto"` or `"always"`. Multi-line triggers when cursor is after `def`, `class`, `if`, `:`, `{`, `(`, etc. If you're on a blank line after a trigger, the classifier checks the previous line.

**Q: Completions aren't appearing?**  
A: Check (1) API key is set, (2) extension is enabled (status bar shows checkmark), (3) you're in a supported language.

**Q: How do I get more creative completions?**  
A: Use `DeepSeek Autocomplete: Set Temperature` → try 0.3 or 0.5.

**Q: Is my API key safe?**  
A: Yes. It's stored in your OS keychain (not settings.json), transmitted over HTTPS, and never logged.

## License

[MIT](LICENSE)
