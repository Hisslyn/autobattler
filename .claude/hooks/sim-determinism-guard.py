#!/usr/bin/env python3
"""sim-determinism-guard.py — keep packages/sim deterministic.

Claude Code PostToolUse hook for Edit|Write|MultiEdit. When an agent (or you)
edits a TypeScript source file under `packages/sim`, this re-reads the file and
blocks the edit if it introduces anything that breaks the sim's hard invariant:

    packages/sim is pure: no Math.random, no Date, no floats.
    All arithmetic is integer fixed-point (scale 1000). All randomness goes
    through the seeded mulberry32 PRNG in prng.ts.

How it works:
  - Reads the edited file path from the hook JSON on stdin (tool_input.file_path),
    or from argv[0] when run by hand.
  - Acts ONLY on packages/sim/**/*.ts source files (test/spec/.d.ts excluded).
    Everything else exits 0 immediately — this guard is intentionally narrow.
  - Strips comments and string/template literals BEFORE scanning, so a comment
    like "scale 1000 = 1.0" or a version string never trips a false positive.
  - Exit 0 = clean. Exit 2 = violation found (Claude Code surfaces the stderr
    message to the agent so it fixes the edit before moving on).

Escape hatches (use sparingly, and prefer fixing the code):
  - Put `// sim-guard-allow` at the end of a specific line to exempt that line.
  - Set env ALLOW_SIM_VIOLATION=1 to bypass the whole check once (emergencies).

Run standalone to test:  echo '{"tool_input":{"file_path":"x.ts"}}' | sim-determinism-guard.py
"""
import json
import os
import re
import sys

# --- which files this guard applies to -------------------------------------
SIM_DIR = "packages/sim/"
EXCLUDE_SUFFIXES = (".test.ts", ".spec.ts", ".d.ts")

# --- what counts as a determinism violation --------------------------------
# Each entry: (regex, human-readable reason). These run against CODE ONLY
# (comments and string literals already stripped out).
FORBIDDEN = [
    (re.compile(r"\bMath\.random\b"), "Math.random — use the seeded mulberry32 PRNG (prng.ts)"),
    (re.compile(r"\bDate\.now\b"), "Date.now — sim must not read wall-clock time"),
    (re.compile(r"\bnew\s+Date\b"), "new Date — sim must not read wall-clock time"),
    (re.compile(r"\bperformance\.now\b"), "performance.now — sim must not read wall-clock time"),
    (re.compile(r"\bcrypto\b"), "crypto — non-deterministic source; use the seeded PRNG"),
    # A float literal: a decimal point between/after digits, not a property
    # access (a.b) and not part of a larger token. e.g. 0.5, 1.8, .25
    (re.compile(r"(?<![\w.])\d*\.\d+\b"), "float literal — use integer fixed-point (scale 1000)"),
]

ALLOW_MARK = "sim-guard-allow"


def target_from_stdin():
    """Claude Code pipes the tool call as JSON; pull the edited file path."""
    try:
        data = json.load(sys.stdin)
    except Exception:
        return None
    ti = data.get("tool_input") or data.get("toolInput") or {}
    return ti.get("file_path") or ti.get("path") or data.get("file_path")


def applies_to(path):
    p = path.replace("\\", "/")
    if not p.endswith(".ts") or p.endswith(EXCLUDE_SUFFIXES):
        return False
    return SIM_DIR in p


def strip_noise(src):
    """Return the source with comments and string/template literals replaced by
    blanks, preserving newlines and line length so reported line numbers and
    the `// sim-guard-allow` marker still line up. A small char-by-char scanner
    rather than regex, because nested quotes/escapes make regex unreliable."""
    out = []
    i, n = 0, len(src)
    state = "code"  # code | line_comment | block_comment | sq | dq | tq
    while i < n:
        c = src[i]
        nxt = src[i + 1] if i + 1 < n else ""
        if state == "code":
            if c == "/" and nxt == "/":
                state = "line_comment"; out.append("  "); i += 2; continue
            if c == "/" and nxt == "*":
                state = "block_comment"; out.append("  "); i += 2; continue
            if c == "'":
                state = "sq"; out.append(" "); i += 1; continue
            if c == '"':
                state = "dq"; out.append(" "); i += 1; continue
            if c == "`":
                state = "tq"; out.append(" "); i += 1; continue
            out.append(c); i += 1; continue
        # inside a comment or string: keep newlines, blank everything else
        if state == "line_comment":
            if c == "\n":
                state = "code"; out.append("\n")
            else:
                out.append(" ")
            i += 1; continue
        if state == "block_comment":
            if c == "*" and nxt == "/":
                state = "code"; out.append("  "); i += 2; continue
            out.append("\n" if c == "\n" else " "); i += 1; continue
        # string literals: honor backslash escapes; keep newlines
        if c == "\\":
            out.append("  "); i += 2; continue
        if state == "sq" and c == "'":
            state = "code"; out.append(" "); i += 1; continue
        if state == "dq" and c == '"':
            state = "code"; out.append(" "); i += 1; continue
        if state == "tq" and c == "`":
            state = "code"; out.append(" "); i += 1; continue
        out.append("\n" if c == "\n" else " "); i += 1; continue
    return "".join(out)


def scan(path):
    """Return a list of (lineno, reason, snippet) violations, [] if clean."""
    try:
        with open(path, "r", encoding="utf-8") as fh:
            raw = fh.read()
    except OSError:
        return []  # can't read it (e.g. deleted) — nothing to guard
    raw_lines = raw.splitlines()
    code_lines = strip_noise(raw).splitlines()
    found = []
    for idx, code in enumerate(code_lines):
        original = raw_lines[idx] if idx < len(raw_lines) else ""
        if ALLOW_MARK in original:
            continue  # explicit per-line opt-out
        for rx, reason in FORBIDDEN:
            m = rx.search(code)
            if m:
                found.append((idx + 1, reason, original.strip()))
                break  # one reason per line is enough
    return found


def main():
    if os.environ.get("ALLOW_SIM_VIOLATION") == "1":
        return 0
    target = sys.argv[1] if len(sys.argv) > 1 else target_from_stdin()
    if not target or not applies_to(target):
        return 0
    violations = scan(target)
    if not violations:
        return 0
    rel = target.replace("\\", "/")
    print("sim-determinism-guard: blocked edit to %s" % rel, file=sys.stderr)
    print("packages/sim must stay pure (no Math.random / Date / floats):", file=sys.stderr)
    for lineno, reason, snippet in violations:
        print("  L%d: %s" % (lineno, reason), file=sys.stderr)
        if snippet:
            print("       %s" % snippet, file=sys.stderr)
    print("Fix it, or add `// sim-guard-allow` on the line if it is a true exception.",
          file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main())
