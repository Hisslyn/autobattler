# Music drop-in slot

Procedural SFX are synthesized at runtime (no files needed). Background music is a
pluggable file slot loaded by `src/audio/manager.ts`. Drop real tracks here:

- `menuTheme.mp3` — looped on the meta menus
- `matchTheme.mp3` — looped during a match

Vite serves `public/` at the site root, so the manager fetches `/audio/<slot>.mp3`.
If a file is absent (or the network is locked), music no-ops cleanly — gameplay and
SFX are unaffected. To change the lookup path, pass an `assetsBase` to `AudioManager`.
