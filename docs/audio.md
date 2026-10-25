# Synthesized audio

The current score and effects follow the owner's approved [Sound Lab](audio/sound-lab.html), dated 2026-10-25.
All audio is generated locally with Web Audio: no recordings, samples, audio files or network requests in the game.
The three scores are camp (76 BPM), descent (66 BPM) and Cerberus (132 BPM), with four cave soundscapes.
Music is filtered by lantern fullness; heartbeat and crackle begin at 25% or below.

Playback starts after a click or keypress. Mute covers music, effects and ambience; hidden tabs stop scheduling and
release voices. The Audio settings button offers separate music/effects sliders (ambience follows effects), saved
in `emberdeep-audio-v1`, independently of the game save. One AudioContext and one 50ms scheduler are shared.
Track changes fade out for 0.5s, stop the outgoing score, then fade in for 0.5s; missed notes are never replayed.

See [implementation, event mapping and listening guide](design/audio-2026-10.md) and [signal QA](audio-qa.json).
With `npm run dev` running:

```powershell
$env:SMOKE_CHANNEL='msedge'
node scripts/audio-render.mjs
node scripts/audio-smoke.mjs
```

Generated WAVs and the real-game audio recording live under ignored `artifacts/audio/`. The older
`docs/audio/lanterns-below-preview.wav` is a historical QA capture, never loaded by the game.
