export async function* parseSSEStream(
  response: import('http').IncomingMessage
): AsyncGenerator<string> {
  let buffer = '';

  for await (const chunk of response) {
    buffer += chunk.toString();

    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed === '') continue;
      if (trimmed === 'data: [DONE]') return;

      if (trimmed.startsWith('data: ')) {
        const data = trimmed.slice(6);
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
}
