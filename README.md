# DeepSeek Autocomplete

[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code-Marketplace-blue)](https://marketplace.visualstudio.com/items?itemName=andyanamafaza.deepseek-fim-auto-complete)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

**AI-powered code completions** for VS Code using DeepSeek's Fill-in-the-Middle API.  
Context-aware inline suggestions for 16+ languages — works like Copilot, powered by DeepSeek.

---

## Features

- **Adaptive ghost text** — suggestion text shrinks in real-time as you type matching characters, avoiding unnecessary API calls
- **Multi-line ghost text** — suggests full functions, blocks, and expressions, not just single lines
- **FIM context-aware** — understands prefix (before cursor) and suffix (after cursor) for precise insertions
- **Streaming** — tokens arrive as generated, no waiting for full response; gzip-compressed for speed
- **Smart multi-line detection** — auto-triggers after `def`, `class`, `if`, `{`, `:`, `(`, and when inside an existing block
- **3 parallel suggestions** — see multiple completion alternatives; cycle with `Alt+]` / `Alt+[`
- **Word-by-word acceptance** — `Ctrl+Right` accepts one word at a time
- **Multi-model support** — switch between `v4-flash` (fast) and `v4-pro` (quality) with one click
- **True LRU cache** — recently accessed completions survive eviction; repeated patterns complete instantly
- **Cross-file context** — scans open tabs and workspace files for related functions, classes, and imports
- **Git diff awareness** — recent uncommitted changes are included as prompt context
- **TF-IDF similar code matching** — finds code blocks with similar keywords in the same file
- **Diagnostics context** — errors and warnings near the cursor are included in the prompt
- **Adaptive streaming timeout** — first requests and cold starts get longer timeouts (up to 4s)
- **Sensitive file filter** — skips `.env`, secrets, credentials, `config.json` in safe paths; custom glob patterns
- **Usage statistics** — tracks shown/accepted completions, tokens used, estimated cost; suggests v4-pro if acceptance rate is low
- **Secure API key storage** — stored in OS keychain via `SecretStorage`, auto-invalidated on external changes
- **Dynamic debug logging** — toggle `deepseekFim.debug` at runtime, no reload needed
- **Config re-validation** — settings changes are validated live via `onDidChangeConfiguration`
- **16+ languages** — JavaScript, TypeScript, TSX, JSX, Python, Java, Go, Rust, C, C++, C#, Ruby, PHP, Swift, Kotlin, Scala, Lua, SQL

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
| `Ctrl+Right` | Accept next word (when ghost text visible) |
| `Alt+]` / `Alt+[` | Cycle to next / previous suggestion |
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
| `DeepSeek Autocomplete: Accept Next Word` | Accept one word of inline completion |
| `DeepSeek Autocomplete: Next Suggestion` | Cycle to next alternative |
| `DeepSeek Autocomplete: Previous Suggestion` | Cycle to previous alternative |
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
| `deepseekFim.streamingTimeout` | 2000 | Single-line early-break timeout in ms (adaptive: first 3 requests get 4s) |
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
| `deepseekFim.acceptOnEnter` | `false` | Accept inline completion on Enter (in addition to Tab) |

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

## Architecture

```
User types → VS Code calls provideInlineCompletionItems
  ├─ Adaptive ghost text reuse (no API call)
  ├─ Cache lookup (exact → prefix → substring → subsequence)
  ├─ Build FIM prompt:
  │   ├─ File metadata
  │   ├─ Enclosing function/class (DocumentSymbols → regex fallback)
  │   ├─ Diagnostics near cursor
  │   ├─ Git diff context (async exec)
  │   ├─ TF-IDF similar code blocks (cached by doc version)
  │   └─ Cross-file context (open tabs + workspace, 20KB capped)
  ├─ Streaming request to DeepSeek API (gzip, adaptive timeout)
  ├─ Overlap trimming against suffix text
  └─ Return InlineCompletionItem → ghost text
```

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
| `npm run compile` | TypeScript compile (`tsc -p ./`) |
| `npm run watch` | Watch mode (`tsc -watch`) |
| `npm run lint` | TypeScript type-check only (`tsc --noEmit`) |
| `npm test` | Compile + E2E tests with `@vscode/test-electron` |
| `npm run vscode:prepublish` | ESBuild production bundle (minified) |

### Packaging

```bash
npx vsce package
code --install-extension deepseek-fim-auto-complete-*.vsix
```

## How it works

1. You pause typing → VS Code calls `provideInlineCompletionItems`
2. **Adaptive ghost text** check: if the characters you just typed match the start of the previously shown ghost text, the remaining text is returned instantly (no API call)
3. The extension extracts **prefix** (code before cursor) and **suffix** (code after cursor) with configurable line/char limits
4. **Cache lookup**: exact match, prefix match, substring match, or subsequence match against existing entries
5. **Enrichment** (cached across keystrokes, debounced at 800ms):
   - Enclosing function/class signature (via DocumentSymbols or regex fallback)
   - Diagnostics near cursor (errors/warnings within ±3 lines)
   - Git diff context (recent unstaged changes, async, cached 30s)
   - TF-IDF similar code blocks from current file (cached by doc version)
   - Related files from open tabs and workspace (limited to 20KB per file)
   - Comment hint above cursor
6. The enriched prompt is sent to DeepSeek's FIM API (`/v1/completions`) via HTTPS with **gzip** `Accept-Encoding`
7. For **single-line** contexts: response is cut early at `;` or 120 chars; no truncation for multi-line content
8. For **multi-line** contexts (after `def`, `class`, `if`, `{`, or inside any block with unclosed `{`): response waits for full block completion using `\n\n\n\n` stop token; per-declaration stop tokens (`\nlet`, `\nconst`) are removed
9. **Stream robustness**: errors mid-stream preserve partial text; `for await...of` wrapped in try/catch
10. The completion is cached (true LRU eviction by `lastAccess`) and returned as ghost text
11. **On accept**: prefetches the next completion into cache (with timeout cleanup and error handling)

## FAQ

**Q: Why multi-line isn't showing up?**  
A: Ensure `deepseekFim.multilineCompletions` is set to `"auto"` or `"always"`. Multi-line triggers when cursor is after `def`, `class`, `if`, `:`, `{`, `(`, or when you're inside any block with an unclosed `{` (even if the trigger line is further up). If you're on a blank line inside a function body, the classifier now detects this and enables multi-line mode.

**Q: Completions aren't appearing?**  
A: Check (1) API key is set, (2) extension is enabled (status bar shows checkmark), (3) you're in a supported language.

**Q: How do I get more creative completions?**  
A: Use `DeepSeek Autocomplete: Set Temperature` → try 0.3 or 0.5.

**Q: Is my API key safe?**  
A: Yes. It's stored in your OS keychain (not settings.json), transmitted over HTTPS, and never logged.

## License

[MIT](LICENSE)
