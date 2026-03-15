/**
 * Shared regex match helper shared by all detector functions.
 *
 * Translates regex matches into CodeFinding objects with accurate line numbers
 * and safely-truncated snippets. The regex is reset after use so callers can
 * pass stateful (global flag) regex literals without side effects.
 */
import type { CodeFinding, CodeFindingRule } from '../types';

const MAX_SNIPPET_LENGTH = 120;

/**
 * Runs a global regex against content and returns one CodeFinding per match.
 * Only the FIRST match per file is reported for most rules to avoid flooding
 * the findings list; callers that want all matches can call this directly.
 */
export function findMatches(
  content: string,
  regex: RegExp,
  filePath: string,
  rule: CodeFindingRule
): CodeFinding[] {
  const findings: CodeFinding[] = [];
  regex.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const matchIndex = match.index;
    const lineNumber = countNewlines(content, matchIndex) + 1;
    const lineStart = content.lastIndexOf('\n', matchIndex - 1) + 1;
    const lineEnd = content.indexOf('\n', matchIndex);
    const rawLine = lineEnd === -1
      ? content.slice(lineStart)
      : content.slice(lineStart, lineEnd);

    const snippet = rawLine.trim().slice(0, MAX_SNIPPET_LENGTH);

    findings.push({ rule, file: filePath, line: lineNumber, snippet });
  }

  regex.lastIndex = 0;
  return findings;
}

function countNewlines(text: string, upToIndex: number): number {
  let count = 0;
  for (let i = 0; i < upToIndex; i++) {
    if (text.charCodeAt(i) === 10) {
      count++;
    }
  }

  return count;
}
