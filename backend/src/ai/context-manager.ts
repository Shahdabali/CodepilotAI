import path from 'path';

export interface ContextFile {
  path: string;
  content: string;
  score: number;
  tokens: number;
}

export interface CompressedContext {
  files: Array<{ path: string; content: string; compressed: boolean }>;
  totalTokens: number;
  omittedFilesCount: number;
}

export class ContextManager {
  private static readonly IGNORED_PATTERNS = [
    /node_modules/,
    /\.git[\/\\]/,
    /dist[\/\\]/,
    /build[\/\\]/,
    /\.next[\/\\]/,
    /\.turbo[\/\\]/,
    /coverage[\/\\]/,
    /\.cache[\/\\]/,
    /package-lock\.json$/,
    /pnpm-lock\.yaml$/,
    /yarn\.lock$/,
    /\.(png|jpg|jpeg|gif|ico|svg|webp|woff|woff2|ttf|eot|mp4|webm|zip|tar|gz|exe|dll|so|dylib)$/i,
  ];

  static estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  static isRelevantFile(filePath: string): boolean {
    const normalized = filePath.replace(/\\/g, '/');
    for (const pattern of this.IGNORED_PATTERNS) {
      if (pattern.test(normalized)) return false;
    }
    return true;
  }

  static scoreFile(filePath: string, content: string, taskPrompt: string): number {
    let score = 10;
    const lowerPath = filePath.toLowerCase();
    const lowerPrompt = taskPrompt.toLowerCase();
    const baseName = path.basename(filePath).toLowerCase();

    // High relevance if explicit filename or path in prompt
    if (lowerPrompt.includes(baseName)) {
      score += 100;
    } else {
      const parts = baseName.split(/[\.\-_]/);
      for (const part of parts) {
        if (part.length > 2 && lowerPrompt.includes(part)) {
          score += 25;
        }
      }
    }

    // Core entry files get higher default score
    if (/^(index|main|app|server|router|schema|types)\.(ts|js|tsx|jsx|py|go|rs)$/i.test(baseName)) {
      score += 20;
    }

    // Keyword hits inside content (bonus up to 40)
    const keywords = lowerPrompt
      .replace(/[^a-z0-9]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3);

    let hits = 0;
    const lowerContent = content.toLowerCase();
    for (const kw of keywords) {
      if (lowerContent.includes(kw)) {
        hits++;
      }
    }
    score += Math.min(hits * 5, 40);

    return score;
  }

  /**
   * Compress and prioritize context files to fit comfortably within target token budget
   */
  static prepareContext(
    files: Array<{ path: string; content: string }>,
    taskPrompt: string,
    maxTokens: number = 30000
  ): CompressedContext {
    // 1. Filter out ignored files
    const relevant = files.filter(f => this.isRelevantFile(f.path));

    // 2. Score each file
    const scoredFiles: ContextFile[] = relevant.map(f => {
      const tokens = this.estimateTokens(f.content);
      const score = this.scoreFile(f.path, f.content, taskPrompt);
      return { path: f.path, content: f.content, score, tokens };
    });

    // 3. Sort descending by score
    scoredFiles.sort((a, b) => b.score - a.score);

    // 4. Greedily select files up to maxTokens
    let currentTokens = 0;
    const selected: Array<{ path: string; content: string; compressed: boolean }> = [];
    let omittedCount = 0;

    for (const item of scoredFiles) {
      if (currentTokens + item.tokens <= maxTokens) {
        selected.push({ path: item.path, content: item.content, compressed: false });
        currentTokens += item.tokens;
      } else {
        // Try skeleton compression if room remains (> 500 tokens)
        const budgetRemaining = maxTokens - currentTokens;
        if (budgetRemaining > 500 && item.score > 20) {
          const compressedContent = this.compressFile(item.content, budgetRemaining);
          const compressedTokens = this.estimateTokens(compressedContent);
          selected.push({ path: item.path, content: compressedContent, compressed: true });
          currentTokens += compressedTokens;
        } else {
          omittedCount++;
        }
      }
    }

    return {
      files: selected,
      totalTokens: currentTokens,
      omittedFilesCount: omittedCount,
    };
  }

  /**
   * Generate an outline or truncated version of file content
   */
  static compressFile(content: string, maxTokensAllowed: number): string {
    const maxChars = maxTokensAllowed * 4;
    const lines = content.split('\n');

    // If file is already short enough
    if (content.length <= maxChars) return content;

    // Retain header, function/class signatures, and exports
    const retainedLines: string[] = [];
    let currentLength = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isSignature = /^\s*(import|export|class|function|interface|type|def|async|struct|public|private)\b/.test(line);

      if (i < 25 || isSignature || i > lines.length - 15) {
        if (currentLength + line.length + 1 > maxChars) break;
        retainedLines.push(line);
        currentLength += line.length + 1;
      } else if (retainedLines[retainedLines.length - 1] !== '  // ... [truncated content]') {
        retainedLines.push('  // ... [truncated content]');
        currentLength += 28;
      }
    }

    return retainedLines.join('\n');
  }
}
