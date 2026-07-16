# DeepSeek Autocomplete

[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code-Marketplace-blue)](https://marketplace.visualstudio.com/items?itemName=andyanamafaza.deepseek-fim-auto-complete)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![CI](https://github.com/andyanamafaza/deepseek-fim-auto-complete/actions/workflows/ci.yml/badge.svg)](https://github.com/andyanamafaza/deepseek-fim-auto-complete/actions)

**AI-powered code completions** for VS Code using DeepSeek's Fill-in-the-Middle API.  
Fast, context-aware inline suggestions that work like GitHub Copilot — powered by DeepSeek.

---

## Features

- **Ghost text completions** appear inline as you type
- **Fill-in-the-Middle** understands both prefix (before cursor) and suffix (after cursor) context
- **Streaming** — suggestions appear progressively, no waiting for full response
- **Multi-line detection** — automatically offers block completions after `{`, `:`, `def`, `function`, etc.
- **Multiple alternatives** — `Ctrl+Space` shows 3 variations at different temperatures
- **LRU cache** — repeated patterns complete instantly from memory
- **Smart filtering** — skips sensitive files (`.env`, secrets, credentials), configurable glob patterns
- **Usage statistics** — tracks shown/accepted completions, tokens used, estimated cost
- **14+ languages** with tuned stop tokens per language

## Requirements

- [VS Code](https://code.visualstudio.com/) 1.68+
- [DeepSeek API key](https://platform.deepseek.com/api_keys) (free credits available)

## Quick Start

### 1. Install the extension
Search for "DeepSeek Autocomplete" in the VS Code marketplace or install from VSIX.

### 2. Set your API key
```
Ctrl+Shift+P → DeepSeek Autocomplete: Set API Key
```
Paste your key — it's stored securely in your OS keychain, not in settings files.

### 3. Start typing
Open any supported file. Ghost text suggestions appear inline as you pause while typing.

| Key | Action |
|-----|--------|
| `Tab` | Accept completion |
| `Escape` | Dismiss |
| `Ctrl+Shift+.` | Toggle on/off |
| `Ctrl+Right` | Accept word-by-word |
| `Ctrl+Space` | Show 3 alternative completions |

## Configuration

All settings are under `deepseekFim.*` in VS Code settings (`Ctrl+,` → search "deepseek").

### Essential

| Setting | Default | Description |
|---------|---------|-------------|
| `deepseekFim.model` | `deepseek-v4-flash` | Model: `v4-flash` (fast) or `v4-pro` (quality) |
| `deepseekFim.enabled` | `true` | Master toggle |
| `deepseekFim.triggerMode` | `automatic` | `automatic` = while typing, `manual` = only on `Ctrl+Space` |

### Performance

| Setting | Default | Description |
|---------|---------|-------------|
| `deepseekFim.debounceMs` | 300 | Delay before requesting (lower = faster but more API calls) |
| `deepseekFim.maxTokens` | 256 | Max tokens per completion |
| `deepseekFim.temperature` | 0.0 | 0 = deterministic, higher = more creative |
| `deepseekFim.streamingTimeout` | 500 | Max ms to wait for streaming before showing partial result |
| `deepseekFim.cacheSize` | 500 | LRU cache entries (0 = disabled) |

### Context

| Setting | Default | Description |
|---------|---------|-------------|
| `deepseekFim.maxPrefixChars` | 6000 | Max characters before cursor sent as prompt |
| `deepseekFim.maxSuffixChars` | 2000 | Max characters after cursor sent as suffix |
| `deepseekFim.maxPrefixLines` | 100 | Line-based cap (applied after char limit) |
| `deepseekFim.maxSuffixLines` | 50 | Line-based cap (applied after char limit) |

### Advanced

| Setting | Default | Description |
|---------|---------|-------------|
| `deepseekFim.baseUrl` | `https://api.deepseek.com/beta` | Change for custom/enterprise deployments |
| `deepseekFim.timeoutMs` | 10000 | HTTP request timeout |
| `deepseekFim.multilineCompletions` | `auto` | `auto`, `always`, or `never` |
| `deepseekFim.stopSequences` | `[]` | Custom stop sequences appended to language defaults |
| `deepseekFim.disableInFiles` | `[]` | Glob patterns to skip (e.g. `**/*.min.js`) |
| `deepseekFim.debug` | `false` | Verbose logging to output channel |
| `deepseekFim.snippetSupport` | `false` | Enable tab-stop placeholders (`$1`, `${1:name}`) |

## Commands

| Command | Description |
|---------|-------------|
| `DeepSeek Autocomplete: Toggle` | Enable/disable completions |
| `DeepSeek Autocomplete: Set API Key` | Store API key in OS keychain |
| `DeepSeek Autocomplete: Select Model` | Switch model via quick pick |
| `DeepSeek Autocomplete: Usage Statistics` | View shown/accepted/tokens/cost |
| `DeepSeek Autocomplete: Debug Log` | Open debug output channel |

## Supported Languages

JavaScript, TypeScript, Python, Java, Go, Rust, C, C++, C#, Ruby, PHP, Swift, Kotlin, Scala, Lua, SQL

Each language has custom stop tokens and comment styles for optimal completions.

## Privacy & Security

- **API key** is stored in your OS keychain via VS Code's [`SecretStorage`](https://code.visualstudio.com/api/references/vscode-api#SecretStorage) — never in settings files or logs.
- **Prompts** are sent to DeepSeek's API only when generating completions. No telemetry or analytics.
- **Sensitive files** matching `.env`, `*secret*`, `*credential*`, `*password*`, and custom `disableInFiles` patterns are skipped automatically.
- **No data collection** — the extension does not collect usage data, send analytics, or phone home (other than API requests you explicitly enable).

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
| `npm test` | Run E2E tests |
| `npm run vscode:prepublish` | ESBuild production bundle |

### Packaging

```bash
npx vsce package
code --install-extension deepseek-fim-auto-complete-*.vsix
```

## FAQ

**Q: How is this different from GitHub Copilot?**  
A: It uses DeepSeek's models instead of OpenAI's. DeepSeek is significantly cheaper ($0.28/M output tokens vs Copilot's $X), and the FIM mode is specifically designed for code infilling.

**Q: My completions aren't showing up.**  
A: Check that (1) you've set your API key, (2) the extension is enabled (status bar shows checkmark), and (3) you're in a supported file type.

**Q: Can I use my own DeepSeek endpoint?**  
A: Yes! Set `deepseekFim.baseUrl` to your custom endpoint URL.

## License

[MIT](LICENSE)
