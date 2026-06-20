# Path & purpose

`packages/client/public/audio/README.md` -- documents the audio "drop-in slot" convention: how to override the client's procedural/generative audio with real audio files, without touching code.

# Responsibility

Specifies the file-naming contract and fallback behavior for the audio asset slots that `packages/client/src/audio/manager.ts`, `director.ts`, `music.ts`, and `sfx.ts` consume at runtime. This is documentation for content authors/designers wanting to add real audio, not for engine code.

# Exports

None -- markdown, not code.

# Key behavior

- States that SFX are synthesized procedurally (layered ADSR voices + filtered noise + shared reverb, see `sfx.ts`) and music is generative by default (see `music.ts`) -- no files are required for the game to have full audio.
- Per-state music override: drop `public/audio/music/<state>.mp3` (preferred) or `.ogg` (fallback) where `<state>` is one of `menu` (meta menus, calm), `planning` (warm/mid), `combat` (tense/rhythmic), `results` (match-over, underscores like menu). The manager tries `.mp3` then `.ogg`; if neither resolves, generative music plays with no error. Transitions between states crossfade.
- Recommended file specs: seamlessly loopable, 44.1kHz, ~-16 LUFS integrated (headroom -- music sits low under SFX in the mix), stereo, >=~30s (avoid a tight-feeling loop).
- Per-event SFX override (optional): drop `public/audio/sfx/<event>.(mp3|ogg)` using the exact SFX event names defined in `src/audio/sfx.ts` (e.g. `buy`, `crit`, `starUp`). Absent files fall back to the synthesized voice for that event.
- Autoplay note: browsers start the AudioContext suspended until a user gesture; the first tap/click resumes it and (re)starts the current music state so menu music begins on first interaction. Muting, zero music volume, or the music on/off toggle stop the generative nodes entirely (saves CPU).
- Asset base path: Vite serves `public/` at the site root, so the manager fetches `/audio/music/<state>.<ext>`; the base is overridable via an `assetsBase` parameter (in code, not documented further here).

# Invariants & constraints

- A dropped-in file always wins; the procedural/generative version is always the fallback -- this is the core contract any code touching audio resolution must preserve.
- Absent files must no-op cleanly (no console errors, no broken audio) -- silently falling back, per both this doc and the parallel public/units/README.md and public/items/README.md conventions.
- File naming is exact-match on event/state name -- no fuzzy matching, no directory scanning; the manager tries specific deterministic paths per name.

# Depends on

Nothing programmatically -- references `packages/client/src/audio/sfx.ts` (the source of truth for valid event names) and the audio manager/director/music modules that implement the resolution logic this README only describes.

# Used by

Read by humans/content authors adding audio assets; the actual runtime behavior it describes is implemented in `packages/client/src/audio/manager.ts` (file-vs-generative resolution + crossfade), `director.ts` (state mapping + file-slot path helpers), and `music.ts`/`sfx.ts` (the generative/procedural fallbacks).

# Notes

- This is one of three parallel "drop-in slot" READMEs in the repo (audio, items, units) -- all follow the identical pattern: procedural/generic default, real-asset override by exact filename convention, graceful absent-file fallback. Consistent design language across all three asset systems.
