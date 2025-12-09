export class SSEStreamParser {
  private buffer = '';

  parseChunk(chunk: Buffer): string[] {
    this.buffer += chunk.toString();
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';

    const dataLines: string[] = [];
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (data && data !== '[DONE]') {
          dataLines.push(data);
        }
      }
    }
    return dataLines;
  }

  isDone(chunk: Buffer): boolean {
    return chunk.toString().includes('data: [DONE]');
  }

  reset(): void {
    this.buffer = '';
  }
}
