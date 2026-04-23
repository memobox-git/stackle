// Simple word-level LCS diff. Outputs a sequence of tokens marked as
// "same" / "added" / "removed" so we can render red strike + green insert
// inline instead of showing two separate boxes.

export type DiffToken = { kind: "same" | "added" | "removed"; text: string };

function tokenize(s: string): string[] {
  // Split on whitespace but keep word + trailing punctuation together
  // plus each whitespace run as its own token so rendering preserves spacing.
  const out: string[] = [];
  const regex = /(\s+|[^\s]+)/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(s))) out.push(m[0]);
  return out;
}

export function wordDiff(before: string, after: string): DiffToken[] {
  const a = tokenize(before);
  const b = tokenize(after);
  const n = a.length, m = b.length;

  // LCS DP table
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack
  const tokens: DiffToken[] = [];
  let i = n, j = m;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      tokens.push({ kind: "same", text: a[i - 1] });
      i--; j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      tokens.push({ kind: "removed", text: a[i - 1] });
      i--;
    } else {
      tokens.push({ kind: "added", text: b[j - 1] });
      j--;
    }
  }
  while (i > 0) { tokens.push({ kind: "removed", text: a[i - 1] }); i--; }
  while (j > 0) { tokens.push({ kind: "added", text: b[j - 1] }); j--; }
  return tokens.reverse();
}
