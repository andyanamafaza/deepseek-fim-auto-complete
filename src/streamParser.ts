export async function* parseSSEStream(
  response: import('http').IncomingMessage
): AsyncGenerator<string> {
  let buffer = '';

  for await (const chunk of response) {
    buffer += chunk.toString();

    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';

    for (const part of parts) {
      if (!part.trim()) continue;

      const dataLines: string[] = [];
      for (const line of part.split('\n')) {
        if (line.startsWith('data: ')) {
          dataLines.push(line.slice(6));
        }
      }

      if (dataLines.length === 0) continue;

      const data = dataLines.join('');
      if (data === '[DONE]') return;

      try {
        const parsed = JSON.parse(data);
        const text = parsed.choices?.[0]?.text;
        if (text !== undefined && text !== null) {
          yield text;
        }
      } catch {
        continue;
      }
    }
  }
}
