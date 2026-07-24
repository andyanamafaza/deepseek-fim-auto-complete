import { Config } from './config';

export interface ConfigWarning {
  setting: string;
  message: string;
}

export function validateConfig(config: Config): ConfigWarning[] {
  const warnings: ConfigWarning[] = [];

  const maxTokens = config.maxTokens;
  if (maxTokens < 16) {
    warnings.push({ setting: 'maxTokens', message: `maxTokens (${maxTokens}) is below minimum 16. Using 16.` });
  }
  if (maxTokens > 4096) {
    warnings.push({ setting: 'maxTokens', message: `maxTokens (${maxTokens}) exceeds FIM limit of 4096. Using 4096.` });
  }

  const temp = config.temperature;
  if (temp < 0 || temp > 2) {
    warnings.push({ setting: 'temperature', message: `temperature (${temp}) is out of range [0, 2].` });
  }

  const debounce = config.debounceMs;
  if (debounce < 100 || debounce > 5000) {
    warnings.push({ setting: 'debounceMs', message: `debounceMs (${debounce}) is out of range [100, 5000].` });
  }

  const timeout = config.timeoutMs;
  if (timeout < 1000 || timeout > 120000) {
    warnings.push({ setting: 'timeoutMs', message: `timeoutMs (${timeout}) is out of range [1000, 120000].` });
  }

  const cacheSize = config.cacheSize;
  if (cacheSize < 0 || cacheSize > 10000) {
    warnings.push({ setting: 'cacheSize', message: `cacheSize (${cacheSize}) is out of range [0, 10000].` });
  }

  const prefixLines = config.maxPrefixLines;
  if (prefixLines < 1) {
    warnings.push({ setting: 'maxPrefixLines', message: `maxPrefixLines (${prefixLines}) must be >= 1.` });
  }

  const suffixLines = config.maxSuffixLines;
  if (suffixLines < 1) {
    warnings.push({ setting: 'maxSuffixLines', message: `maxSuffixLines (${suffixLines}) must be >= 1.` });
  }

  const streamTimeout = config.streamingTimeout;
  if (streamTimeout < 100 || streamTimeout > 10000) {
    warnings.push({ setting: 'streamingTimeout', message: `streamingTimeout (${streamTimeout}) is out of range [100, 10000].` });
  }

  const baseUrl = config.baseUrl;
  if (baseUrl !== 'https://api.deepseek.com/beta') {
    try {
      new URL(baseUrl);
    } catch {
      warnings.push({ setting: 'baseUrl', message: `baseUrl ("${baseUrl}") is not a valid URL.` });
    }
  }

  return warnings;
}
