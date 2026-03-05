/**
 * Cursor Sound Effects
 *
 * Subtle audio feedback using Web Audio API (no external files).
 * Generates short synthesized tones for click, success, error, and start events.
 *
 * Sound profiles adapt to the active theme:
 *   - ghost  — soft sine tones (warm, friendly)
 *   - neon   — electronic square/triangle tones (cyber, punchy)
 *   - robot  — metallic square tones (mechanical, sharp)
 *
 * Sound can be toggled off via localStorage flag.
 *
 * @module components/cursor/cursor-sounds
 */

const STORAGE_KEY = "cursor-sounds-enabled";

/** Check if sounds are enabled (default: true) */
export function isSoundEnabled(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw !== "false";
  } catch {
    return true;
  }
}

/** Toggle sound on/off and persist */
export function setSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled));
  } catch { /* ignore */ }
}

/** Lazy AudioContext — created on first use to comply with autoplay policy */
let audioCtx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    try {
      audioCtx = new AudioContext();
    } catch {
      return null;
    }
  }
  return audioCtx;
}

/**
 * Play a short beep tone.
 * @param frequency - Hz (higher = more treble)
 * @param duration  - seconds
 * @param volume    - 0..1
 * @param type      - oscillator wave shape
 */
function beep(
  frequency: number,
  duration: number,
  volume = 0.08,
  type: OscillatorType = "sine",
): void {
  if (!isSoundEnabled()) return;
  const ctx = getContext();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.value = frequency;

  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}

// ===========================================
// Sound Profiles — per-theme tone presets
// ===========================================

export interface SoundProfile {
  click: { freq: number; dur: number; vol: number; wave: OscillatorType };
  successA: { freq: number; dur: number; vol: number; wave: OscillatorType };
  successB: { freq: number; dur: number; vol: number; wave: OscillatorType };
  errorA: { freq: number; dur: number; vol: number; wave: OscillatorType };
  errorB: { freq: number; dur: number; vol: number; wave: OscillatorType };
  startA: { freq: number; dur: number; vol: number; wave: OscillatorType };
  startB: { freq: number; dur: number; vol: number; wave: OscillatorType };
}

const GHOST_SOUNDS: SoundProfile = {
  click: { freq: 800, dur: 0.05, vol: 0.06, wave: "square" },
  successA: { freq: 523, dur: 0.12, vol: 0.07, wave: "sine" },      // C5
  successB: { freq: 659, dur: 0.15, vol: 0.07, wave: "sine" },      // E5
  errorA: { freq: 300, dur: 0.15, vol: 0.07, wave: "sawtooth" },
  errorB: { freq: 220, dur: 0.2, vol: 0.06, wave: "sawtooth" },
  startA: { freq: 400, dur: 0.1, vol: 0.05, wave: "sine" },
  startB: { freq: 600, dur: 0.1, vol: 0.05, wave: "sine" },
};

const NEON_SOUNDS: SoundProfile = {
  click: { freq: 1200, dur: 0.03, vol: 0.05, wave: "square" },
  successA: { freq: 660, dur: 0.1, vol: 0.06, wave: "triangle" },    // E5
  successB: { freq: 880, dur: 0.12, vol: 0.06, wave: "triangle" },   // A5
  errorA: { freq: 200, dur: 0.12, vol: 0.06, wave: "square" },
  errorB: { freq: 150, dur: 0.18, vol: 0.05, wave: "square" },
  startA: { freq: 500, dur: 0.08, vol: 0.05, wave: "triangle" },
  startB: { freq: 750, dur: 0.08, vol: 0.05, wave: "triangle" },
};

const ROBOT_SOUNDS: SoundProfile = {
  click: { freq: 1000, dur: 0.04, vol: 0.06, wave: "square" },
  successA: { freq: 440, dur: 0.1, vol: 0.06, wave: "square" },     // A4
  successB: { freq: 587, dur: 0.12, vol: 0.06, wave: "square" },    // D5
  errorA: { freq: 250, dur: 0.15, vol: 0.07, wave: "sawtooth" },
  errorB: { freq: 180, dur: 0.2, vol: 0.06, wave: "sawtooth" },
  startA: { freq: 350, dur: 0.08, vol: 0.05, wave: "square" },
  startB: { freq: 550, dur: 0.1, vol: 0.05, wave: "square" },
};

const SOUND_PROFILES: Record<string, SoundProfile> = {
  ghost: GHOST_SOUNDS,
  neon: NEON_SOUNDS,
  robot: ROBOT_SOUNDS,
};

/** Active sound profile ID (matches theme ID) */
let activeProfile: string = "ghost";

/** Set the active sound profile — call when theme changes */
export function setSoundProfile(themeId: string): void {
  activeProfile = themeId;
}

function getProfile(): SoundProfile {
  return SOUND_PROFILES[activeProfile] || GHOST_SOUNDS;
}

// ===========================================
// Public sound effects (theme-aware)
// ===========================================

/** Subtle click sound — short high-pitched tick */
export function playClick(): void {
  const p = getProfile().click;
  beep(p.freq, p.dur, p.vol, p.wave);
}

/** Success — pleasant ascending two-tone */
export function playSuccess(): void {
  const prof = getProfile();
  beep(prof.successA.freq, prof.successA.dur, prof.successA.vol, prof.successA.wave);
  setTimeout(
    () => beep(prof.successB.freq, prof.successB.dur, prof.successB.vol, prof.successB.wave),
    100,
  );
}

/** Error — low descending tone */
export function playError(): void {
  const prof = getProfile();
  beep(prof.errorA.freq, prof.errorA.dur, prof.errorA.vol, prof.errorA.wave);
  setTimeout(
    () => beep(prof.errorB.freq, prof.errorB.dur, prof.errorB.vol, prof.errorB.wave),
    120,
  );
}

/** Start — soft rising tone */
export function playStart(): void {
  const prof = getProfile();
  beep(prof.startA.freq, prof.startA.dur, prof.startA.vol, prof.startA.wave);
  setTimeout(
    () => beep(prof.startB.freq, prof.startB.dur, prof.startB.vol, prof.startB.wave),
    80,
  );
}
