// src/core/AudioManager.js
// Full audio engine: spatial SFX with distance falloff, seamless music
// crossfading between zones and combat states, SFX instance pooling so rapid
// impacts never cut each other off, and character voice line queuing.

import { Sound, Vector3 } from "@babylonjs/core";
import { CONFIG } from "../config/index.js";

// ─── Music Track Definitions ──────────────────────────────────────────────────

const MUSIC_TRACKS = {
  MENU:       { id: "music_menu",    loop: true,  volume: 0.5  },
  EARTH:      { id: "music_earth",   loop: true,  volume: 0.45 },
  NAMEK:      { id: "music_namek",   loop: true,  volume: 0.45 },
  HTC:        { id: "music_htc",     loop: true,  volume: 0.45 },
  LOOKOUT:    { id: "music_lookout", loop: true,  volume: 0.45 },
  BATTLE:     { id: "music_battle",  loop: true,  volume: 0.65 },
};

// Map zone IDs → music tracks
const ZONE_MUSIC_MAP = {
  EARTH_PLAINS:   "EARTH",
  PLANET_NAMEK:   "NAMEK",
  HYPERBOLIC_TC:  "HTC",
  KAMI_LOOKOUT:   "LOOKOUT",
};

// SFX that benefit from pooling (rapid-fire sounds)
const POOLED_SOUNDS = {
  "sfx_punch_light": 8,
  "sfx_punch_heavy": 4,
  "sfx_ki_blast":    6,
  "sfx_beam_fire":   2,
  "sfx_beam_impact": 2,
  "sfx_dodge":       4,
};

// ─── AudioManager ─────────────────────────────────────────────────────────────

export class AudioManager {
  /**
   * @param {import("@babylonjs/core").Scene} scene
   * @param {import("./AssetLoader").AssetLoader} assetLoader
   */
  constructor(scene, assetLoader) {
    this.scene       = scene;
    this.assetLoader = assetLoader;

    /** Master gain (0–1) applied to all sounds */
    this.masterVolume = CONFIG.audio.masterVolume;
    this.musicVolume  = CONFIG.audio.musicVolume;
    this.sfxVolume    = CONFIG.audio.sfxVolume;
    this.voiceVolume  = CONFIG.audio.voiceVolume;

    /** @type {Map<string, Sound[]>} id → pool of Babylon Sound instances */
    this._sfxPools = new Map();

    /** @type {Map<string, number>} pool id → next index (round-robin) */
    this._poolIndex = new Map();

    /** @type {Sound | null} currently playing music */
    this._currentMusic = null;
    this._currentMusicId = null;

    /** @type {Sound | null} next music (fading in) */
    this._nextMusic = null;

    /** Crossfade state */
    this._crossfading    = false;
    this._crossfadeTimer = 0;
    this._crossfadeDuration = 1.5;   // seconds

    /** @type {Map<string, Sound>} one-off ambient sounds */
    this._ambients = new Map();

    /** Voice line queue per slot */
    this._voiceQueues  = new Map([0,1,2,3].map(s => [s, []]));
    this._voicePlaying = new Map([0,1,2,3].map(s => [s, false]));

    /** Listener position (camera / local player position) */
    this._listenerPos = Vector3.Zero();

    /** Whether Web Audio is available */
    this._webAudioAvailable = typeof AudioContext !== "undefined" || typeof webkitAudioContext !== "undefined";
  }

  // ─── Initialization ───────────────────────────────────────────────────────

  /**
   * Build SFX pools from loaded assets.
   * Call after AssetLoader.loadEssentials() completes.
   */
  buildPools() {
    for (const [id, count] of Object.entries(POOLED_SOUNDS)) {
      const pool = [];
      for (let i = 0; i < count; i++) {
        const sound = this._createSound(id, { loop: false, autoplay: false });
        if (sound) pool.push(sound);
      }
      if (pool.length > 0) {
        this._sfxPools.set(id, pool);
        this._poolIndex.set(id, 0);
      }
    }
    console.log(`[AudioManager] SFX pools built: ${this._sfxPools.size} ids`);
  }

  /**
   * Play a sound effect.
   * Pooled sounds round-robin through instances for overlap.
   *
   * @param {string} id        asset id from ASSET_MANIFEST
   * @param {object} [opts]
   * @param {Vector3} [opts.position]   world-space for 3D spatial audio
   * @param {number}  [opts.volume]     0–1, defaults to sfxVolume
   * @param {number}  [opts.pitch]      playback rate multiplier (1 = normal)
   * @param {boolean} [opts.loop]
   */
  play(id, opts = {}) {
    if (!this._webAudioAvailable) return;

    const vol = (opts.volume ?? 1.0) * this.sfxVolume * this.masterVolume;

    // Pooled?
    if (this._sfxPools.has(id)) {
      const pool  = this._sfxPools.get(id);
      const idx   = this._poolIndex.get(id);
      const sound = pool[idx % pool.length];
      this._poolIndex.set(id, (idx + 1) % pool.length);

      if (sound) {
        sound.setVolume(vol);
        if (opts.pitch) sound.updateOptions({ playbackRate: opts.pitch });
        if (opts.position) this._setPosition(sound, opts.position);
        sound.play();
      }
      return;
    }

    // One-off
    const sound = this._createSound(id, { loop: opts.loop ?? false, autoplay: true });
    if (!sound) return;
    sound.setVolume(vol);
    if (opts.pitch) sound.updateOptions({ playbackRate: opts.pitch });
    if (opts.position) this._setPosition(sound, opts.position);
    if (!opts.loop) {
      sound.onEndedObservable?.addOnce(() => sound.dispose());
    }
  }

  /**
   * Play a sound with a random pitch variation (makes impacts feel less robotic).
   * @param {string} id
   * @param {number} pitchVariance   e.g. 0.1 = ±10% pitch
   * @param {object} [opts]
   */
  playVaried(id, pitchVariance = 0.08, opts = {}) {
    const pitch = 1.0 + (Math.random() * 2 - 1) * pitchVariance;
    this.play(id, { ...opts, pitch });
  }

  playAttackWhoosh(attackId, position = null) {
    if (!attackId) return;

    const opts = { position, volume: 0.5 };
    if (attackId.includes("SWORD")) {
      this.playVaried("sfx_dodge", 0.14, { ...opts, volume: 0.58 });
      return;
    }
    if (attackId.includes("BEAM") || attackId.includes("FLASH") || attackId.includes("BOMB")) {
      this.playVaried("sfx_beam_fire", 0.08, { ...opts, volume: 0.82 });
      return;
    }
    if (attackId.includes("KI") || attackId.includes("SPELL") || attackId.includes("HEAL")) {
      this.playVaried("sfx_ki_blast", 0.12, { ...opts, volume: 0.65 });
      return;
    }

    this.playVaried("sfx_dodge", 0.18, { ...opts, volume: attackId.includes("HEAVY") ? 0.62 : 0.42 });
  }

  playImpactCue(kind, position = null) {
    switch (kind) {
      case "BLOCK":
        this.playVaried("sfx_punch_light", 0.18, { position, volume: 0.34 });
        this.playVaried("sfx_dodge", 0.12, { position, volume: 0.22 });
        break;
      case "SWORD_HEAVY":
        this.playVaried("sfx_dodge", 0.1, { position, volume: 0.4 });
        this.playVaried("sfx_punch_heavy", 0.08, { position, volume: 0.92 });
        break;
      case "SWORD_LIGHT":
        this.playVaried("sfx_dodge", 0.12, { position, volume: 0.36 });
        this.playVaried("sfx_punch_light", 0.12, { position, volume: 0.72 });
        break;
      case "PROJECTILE":
        this.playVaried("sfx_ki_blast", 0.1, { position, volume: 0.85 });
        break;
      case "BEAM":
      case "ULTIMATE":
        this.playVaried("sfx_beam_impact", 0.06, { position, volume: 0.95 });
        break;
      case "HEAVY":
        this.playVaried("sfx_punch_heavy", 0.1, { position, volume: 0.9 });
        break;
      default:
        this.playVaried("sfx_punch_light", 0.14, { position, volume: 0.8 });
        break;
    }
  }

  /**
   * Stop a looping sound.
   * @param {string} id
   */
  stop(id) {
    const pool = this._sfxPools.get(id);
    if (pool) { pool.forEach(s => s.stop()); return; }

    const ambient = this._ambients.get(id);
    if (ambient) { ambient.stop(); this._ambients.delete(id); }
  }

  // ─── Music ────────────────────────────────────────────────────────────────

  /**
   * Switch to a music track with a crossfade.
   * @param {string} trackKey   key from MUSIC_TRACKS (e.g. "BATTLE")
   * @param {number} [fadeTime] crossfade duration in seconds
   */
  async playMusic(trackKey, fadeTime = 1.5) {
    const track = MUSIC_TRACKS[trackKey];
    if (!track) return;
    if (this._currentMusicId === track.id) return;

    const targetVol = track.volume * this.musicVolume * this.masterVolume;
    const newSound  = this._createSound(track.id, { loop: track.loop, autoplay: false, volume: 0 });

    if (!newSound) {
      return;
    }

    this._nextMusic = newSound;
    this._currentMusicId = track.id;
    this._crossfading    = true;
    this._crossfadeTimer = 0;
    this._crossfadeDuration = fadeTime;
    this._crossfadeId    = (this._crossfadeId ?? 0) + 1;
    const currentFadeId  = this._crossfadeId;

    newSound.play();

    // Fade old out, new in over crossfadeDuration
    const old = this._currentMusic;
    const startOldVol = old ? old.getVolume?.() ?? 0 : 0;

    const fadeStart = performance.now();
    const tick = () => {
      if (this._crossfadeId !== currentFadeId) return;
      const t = Math.min(1, (performance.now() - fadeStart) / (fadeTime * 1000));

      newSound.setVolume(targetVol * t);
      if (old) old.setVolume(startOldVol * (1 - t));

      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        old?.stop();
        old?.dispose();
        this._currentMusic   = newSound;
        this._crossfading    = false;
      }
    };
    requestAnimationFrame(tick);
  }

  /** Switch music based on zone id */
  playZoneMusic(zoneId) {
    const trackKey = ZONE_MUSIC_MAP[zoneId] ?? "EARTH";
    this.playMusic(trackKey);
  }

  /** Switch to battle music (during active combat) */
  switchToBattleMusic() {
    if (this._currentMusicId !== "music_battle") this.playMusic("BATTLE", 0.8);
  }

  /** Switch back to zone ambient music */
  switchToAmbientMusic(zoneId) {
    const trackKey = ZONE_MUSIC_MAP[zoneId] ?? "EARTH";
    if (this._currentMusicId !== MUSIC_TRACKS[trackKey]?.id) {
      this.playMusic(trackKey, 2.0);
    }
  }

  stopMusic(fadeTime = 1.0) {
    if (!this._currentMusic) return;
    if (fadeTime <= 0) {
      this._currentMusic.stop();
      this._currentMusic.dispose();
      this._currentMusic = null;
      this._currentMusicId = null;
      return;
    }
    const sound    = this._currentMusic;
    const startVol = sound.getVolume?.() ?? 0;
    const fadeStart = performance.now();

    const tick = () => {
      const t = Math.min(1, (performance.now() - fadeStart) / (fadeTime * 1000));
      sound.setVolume(startVol * (1 - t));
      if (t < 1) requestAnimationFrame(tick);
      else { sound.stop(); sound.dispose(); this._currentMusic = null; this._currentMusicId = null; }
    };
    requestAnimationFrame(tick);
  }

  // ─── Voice Lines ──────────────────────────────────────────────────────────

  /**
   * Queue a voice line for a slot.
   * Lines play sequentially — no overlap per character.
   * @param {number} slot
   * @param {string} id    asset id
   */
  playVoiceLine(slot, id) {
    const queue = this._voiceQueues.get(slot);
    if (!queue) return;
    queue.push(id);
    if (!this._voicePlaying.get(slot)) this._drainVoiceQueue(slot);
  }

  _drainVoiceQueue(slot) {
    const queue = this._voiceQueues.get(slot);
    if (!queue?.length) { this._voicePlaying.set(slot, false); return; }

    this._voicePlaying.set(slot, true);
    const id     = queue.shift();
    const vol    = this.voiceVolume * this.masterVolume;
    const sound  = this._createSound(id, { loop: false, autoplay: true, volume: vol });

    if (!sound) {
      this._drainVoiceQueue(slot);  // skip missing lines
      return;
    }

    let drained = false;
    const drain = () => {
      if (drained) return;
      drained = true;
      sound.dispose();
      this._drainVoiceQueue(slot);
    };
    sound.onEndedObservable?.addOnce(drain);

    // Fallback in case onEnded doesn't fire
    setTimeout(drain, 5000);
  }

  // ─── Ambient / Loop Sounds ────────────────────────────────────────────────

  /**
   * Start a looping ambient sound (portal hum, wind, etc.)
   * @param {string} id
   * @param {Vector3} [position]
   * @param {number} [volume]
   */
  startAmbient(id, position = null, volume = 0.3) {
    if (this._ambients.has(id)) return;
    const sound = this._createSound(id, { loop: true, autoplay: true, volume: volume * this.masterVolume });
    if (!sound) return;
    if (position) this._setPosition(sound, position);
    this._ambients.set(id, sound);
  }

  stopAmbient(id) {
    const s = this._ambients.get(id);
    if (s) { s.stop(); s.dispose(); this._ambients.delete(id); }
  }

  stopAllAmbients() {
    for (const [id] of this._ambients) this.stopAmbient(id);
  }

  // ─── Per-Frame Update ─────────────────────────────────────────────────────

  /**
   * @param {number} delta
   * @param {Vector3} listenerPosition   local player's world position
   * @param {boolean} inCombat
   */
  update(delta, listenerPosition, inCombat) {
    this._listenerPos.copyFrom(listenerPosition);

    // Let Babylon handle 3D audio positioning via the scene's audio engine
    // Update listener transform
    this.scene.audioListenerPositionProvider = () => listenerPosition;
  }

  // ─── Volume Controls ─────────────────────────────────────────────────────

  setMasterVolume(v) {
    this.masterVolume = Math.max(0, Math.min(1, v));
    this._updateAllVolumes();
  }

  setMusicVolume(v) {
    this.musicVolume = Math.max(0, Math.min(1, v));
    if (this._currentMusic) {
      const track = Object.values(MUSIC_TRACKS).find(t => t.id === this._currentMusicId);
      this._currentMusic.setVolume((track?.volume ?? 0.5) * this.musicVolume * this.masterVolume);
    }
  }

  setSFXVolume(v)   { this.sfxVolume   = Math.max(0, Math.min(1, v)); }
  setVoiceVolume(v) { this.voiceVolume = Math.max(0, Math.min(1, v)); }

  _updateAllVolumes() {
    if (this._currentMusic) {
      const track = Object.values(MUSIC_TRACKS).find(t => t.id === this._currentMusicId);
      this._currentMusic.setVolume((track?.volume ?? 0.5) * this.musicVolume * this.masterVolume);
    }
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  _createSound(id, opts = {}) {
    if (!this._webAudioAvailable) return null;

    const asset = this.assetLoader?.getOrFallback(id);
    const source = asset?.resolvedUrl ?? asset?.path ?? asset?.data ?? null;
    if (!source) {
      return null;  // asset not loaded — non-fatal
    }

    try {
      return new Sound(
        `${id}_${Date.now()}`,
        source,
        this.scene,
        null,
        {
          loop:            opts.loop      ?? false,
          autoplay:        opts.autoplay  ?? false,
          volume:          (opts.volume   ?? 1.0) * this.masterVolume,
          spatialSound:    !!opts.position,
          maxDistance:     CONFIG.audio.maxAudibleRange,
          rolloffFactor:   1.2,
          distanceModel:   "exponential",
        }
      );
    } catch {
      return null;
    }
  }

  _setPosition(sound, position) {
    sound.setPosition(position);
    sound.spatialSound = true;
  }

  // ─── Wiring ───────────────────────────────────────────────────────────────

  /**
   * Wire to game events.
   * @param {import("../combat/CombatSystem").CombatSystem} combat
   * @param {import("../world/ZoneManager").ZoneManager} zoneManager
   * @param {import("../character/CharacterRegistry").CharacterRegistry} registry
   */
  wireEvents(combat, zoneManager, registry) {
    combat.on("onHit", (ev) => {
      const position = registry.getState(ev.targetSlot)?.position ?? null;
      const attackId = ev.attackId ?? "";
      const isSword = attackId.includes("SWORD");
      const kind = ev.blocked
        ? "BLOCK"
        : ev.beam
          ? "BEAM"
          : ev.projectile
            ? "PROJECTILE"
            : isSword
              ? (ev.impactType === "HEAVY" ? "SWORD_HEAVY" : "SWORD_LIGHT")
              : (ev.impactType ?? (attackId.includes("HEAVY") ? "HEAVY" : "LIGHT"));
      this.playImpactCue(kind, position);
    });

    combat.on("onBeamFired", () => { this.play("sfx_beam_fire", { volume: 0.9 }); });

    zoneManager.on("onZoneLoaded", (def) => {
      this.playZoneMusic(def.id);
      this.stopAllAmbients();
      if (def.id === "KAMI_LOOKOUT") this.startAmbient("sfx_portal", null, 0.15);
    });

    registry.on("onTransformChanged", (payload) => {
      const slot = payload?.slot;
      const transformId = payload?.transformId ?? payload?.currentTransform?.id ?? null;
      if (transformId) {
        const state   = registry.getState(slot);
        const voiceId = state ? (VOICE_MAP_AUDIO[state.characterId]?.[transformId] ?? null) : null;
        if (voiceId) this.playVoiceLine(slot, voiceId);
      }
    });

    registry.on("onPlayerDied", () => {
      this.play("sfx_death", { volume: 0.8 });
    });

    registry.on("onDamageTaken", () => {
      // Switch to battle music if ambient is playing
      this.switchToBattleMusic();
    });
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────────

  dispose() {
    this.stopMusic(0);
    this.stopAllAmbients();
    for (const [, pool] of this._sfxPools) pool.forEach(s => s.dispose());
    this._sfxPools.clear();
    console.log("[AudioManager] Disposed.");
  }
}

// Voice map for audio wiring (mirrors TransformationSequence's map)
const VOICE_MAP_AUDIO = {
  GOKU:   { SSJ1: "vo_goku_transform",   SSB: "vo_goku_transform"   },
  VEGETA: { SSJ1: "vo_vegeta_transform", SSB: "vo_vegeta_transform" },
};
