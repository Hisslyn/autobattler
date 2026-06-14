# Audio drop-in slots

SFX are synthesized procedurally at runtime (layered ADSR voices + noise + filter
+ a small shared reverb — no files needed). Music is generative by default and
loops/evolves on its own. Both layers accept real-file drop-ins: **a dropped-in
file always wins; the procedural/generative version is the fallback.**

## Per-state music

The music director maps the active scene/phase to a state and plays it:

| State      | When                                  |
| ---------- | ------------------------------------- |
| `menu`     | Meta menus (calm)                     |
| `planning` | Planning phase (warm, mid)            |
| `combat`   | Combat phase (tense, rhythmic)        |
| `results`  | Match-over (underscores like the menu)|

Drop a real track to override a state's generative music:

```
public/audio/music/<state>.mp3   (preferred)
public/audio/music/<state>.ogg   (fallback if no .mp3)
```

e.g. `public/audio/music/combat.mp3`. The manager tries `.mp3` then `.ogg`; if
neither resolves (file absent or network locked) the generative version plays —
no-op clean. Transitions crossfade.

Recommended specs: **seamlessly loopable** (match the tail to the head), 44.1 kHz,
~−16 LUFS integrated (leave headroom — the music bus sits low under SFX), stereo,
≥ ~30 s so loops don't feel tight. Vite serves `public/` at the site root, so the
manager fetches `/audio/music/<state>.<ext>`. Override the base via `assetsBase`.

## Per-event SFX overrides (optional)

Procedural SFX cover the whole palette (UI / combat / economy). To swap an
individual cue for a real sample, drop:

```
public/audio/sfx/<event>.(mp3|ogg)
```

using the SFX names in `src/audio/sfx.ts` (e.g. `buy`, `crit`, `starUp`). Absent
files fall back to the synthesized voice.

## Autoplay

Browsers start the AudioContext suspended until a user gesture. The first tap/click
resumes it and (re)starts the current music state, so menu music begins on the first
interaction. Muting, zero music volume, or the music on/off toggle stop the
generative nodes to save CPU.
