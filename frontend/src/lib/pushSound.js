// Shared push-cue synthesizer. Used by:
//   - PushBroadcastPanel `previewSound` (admin preview)
//   - PushSoundListener (auto-play when SW receives a push while a tab is open)
//
// Sound cues:
//   rally   → `/audio/epic_battle.mp3` file, 3s at 60% volume
//   victory → C5→E5→G5 ascending sine chord (~0.75s)
//   dungeon → A2 + D3 sawtooth horn (~1.1s)
//   alarm   → 4×880Hz square-wave beeps (~0.85s)

let sharedRallyAudio = null;

export const playPushSound = (key = "rally") => {
  return new Promise((resolve) => {
    try {
      if (key === "rally") {
        if (!sharedRallyAudio) {
          sharedRallyAudio = new Audio("/audio/epic_battle.mp3");
          sharedRallyAudio.volume = 0.6;
        }
        sharedRallyAudio.currentTime = 0;
        const p = sharedRallyAudio.play();
        if (p && p.catch) p.catch(() => resolve(false));
        setTimeout(() => {
          try { sharedRallyAudio.pause(); } catch {}
          resolve(true);
        }, 3000);
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { resolve(false); return; }
      const ctx = new AC();
      const gain = ctx.createGain();
      gain.gain.value = 0.15;
      gain.connect(ctx.destination);
      const beep = (freq, start, dur, type = "sine") => {
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, ctx.currentTime + start);
        g.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + start + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
        osc.connect(g); g.connect(gain);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + dur);
      };
      let total = 0.5;
      if (key === "victory") {
        beep(523.25, 0.0, 0.18); beep(659.25, 0.18, 0.18); beep(783.99, 0.36, 0.35);
        total = 0.75;
      } else if (key === "dungeon") {
        beep(110, 0.0, 0.7, "sawtooth"); beep(146.83, 0.35, 0.6, "sawtooth");
        total = 1.1;
      } else if (key === "alarm") {
        beep(880, 0.0, 0.12, "square"); beep(880, 0.2, 0.12, "square"); beep(880, 0.4, 0.12, "square"); beep(880, 0.6, 0.12, "square");
        total = 0.85;
      }
      setTimeout(() => { try { ctx.close(); } catch {} resolve(true); }, total * 1000 + 100);
    } catch {
      resolve(false);
    }
  });
};
