# Project hooks

## sim-determinism-guard.py

A PostToolUse hook (Edit/Write/MultiEdit) that protects the project's single
most important invariant:

> `packages/sim` is pure: no `Math.random`, no `Date`, no floats. All
> arithmetic is integer fixed-point (scale 1000); all randomness goes through
> the seeded mulberry32 PRNG in `prng.ts`.

When any agent — or you — edits a `.ts` source file under `packages/sim`, the
hook re-reads the file and **blocks the edit** (exit 2, message shown to the
agent) if it finds `Math.random`, `Date.now`/`new Date`, `performance.now`,
`crypto`, or a float literal (`0.5`, `1.8`, …). It strips comments and string
literals before scanning, so `// scale 1000 = 1.0` and version strings never
false-positive. Scope is deliberately narrow: only `packages/sim` source
(tests / `.d.ts` excluded); every other file passes untouched.

### Escape hatches
- Append `// sim-guard-allow` to a specific line to exempt just that line.
- Set `ALLOW_SIM_VIOLATION=1` in the env to bypass the whole check once.

Prefer fixing the code over either escape hatch — the whole point is that the
sim stays bit-for-bit reproducible.

### Test it
```bash
echo '{"tool_input":{"file_path":"packages/sim/src/engine.ts"}}' \
  | python3 .claude/hooks/sim-determinism-guard.py ; echo "exit $?"
```

### If you later run the agent-base install.sh
`install.sh` writes its own `.claude/settings.json` (the `validate-frontmatter`
hook) only when one does not already exist. Since this file exists, it will
print "merge yourself" instead. To run both hooks, add the frontmatter entry
into the same `PostToolUse` array — they coexist (different scripts, same
matcher):

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [
          { "type": "command", "command": "python3 \"$CLAUDE_PROJECT_DIR/.claude/hooks/sim-determinism-guard.py\"" },
          { "type": "command", "command": "python3 \"$CLAUDE_PROJECT_DIR/scripts/validate-frontmatter.py\"" }
        ]
      }
    ]
  }
}
```
