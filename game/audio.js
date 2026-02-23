// ===== AUDIO MODULE =====
// Handles background music, victory/defeat music, and SFX using HTML5 Audio

// ---- MUSIC ----
let bgmAudio = null;
let victoryAudio = null;
let defeatAudio = null;

// ---- SFX (pre-loaded for instant playback) ----
let sfxParryNormal = null;
let sfxParryPerfect = null;
let sfxParryMiss = null;

// ---- Web Audio API (for tension loop only) ----
let audioContext = null;
let tensionOscillator = null;
let tensionGain = null;

/**
 * Pre-load all audio assets. Call once on init or first interaction.
 */
function preloadAudio() {
    // Background music
    if (!bgmAudio) {
        bgmAudio = new Audio('assets/music/COMBATTIMENTO_Base.mp3');
        bgmAudio.loop = true;
        bgmAudio.volume = 0.5;
        bgmAudio.preload = 'auto';
    }

    // Victory music
    if (!victoryAudio) {
        victoryAudio = new Audio('assets/music/VITTORIA 1 PROVA.mp3');
        victoryAudio.volume = 0.6;
        victoryAudio.preload = 'auto';
    }

    // Defeat music
    if (!defeatAudio) {
        defeatAudio = new Audio('assets/music/SCONFITTA 1 PROVA.mp3');
        defeatAudio.volume = 0.6;
        defeatAudio.preload = 'auto';
    }

    // SFX
    if (!sfxParryNormal) {
        sfxParryNormal = new Audio('assets/SFX/parata normale.wav');
        sfxParryNormal.volume = 0.7;
        sfxParryNormal.preload = 'auto';
    }

    if (!sfxParryPerfect) {
        sfxParryPerfect = new Audio('assets/SFX/Parata perfetta 1.wav');
        sfxParryPerfect.volume = 0.7;
        sfxParryPerfect.preload = 'auto';
    }

    if (!sfxParryMiss) {
        sfxParryMiss = new Audio('assets/SFX/parata mancata.wav');
        sfxParryMiss.volume = 0.7;
        sfxParryMiss.preload = 'auto';
    }
}

/**
 * Initialize audio context for Web Audio API (tension loop)
 */
export function initAudio() {
    if (audioContext) return;

    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        console.log('[Audio] AudioContext initialized');
    } catch (e) {
        console.warn('[Audio] Web Audio API not supported:', e);
    }

    // Pre-load all audio files
    preloadAudio();
}

// =========================================
// BACKGROUND MUSIC
// =========================================

/**
 * Play background music continuously
 */
export function playBackgroundMusic() {
    preloadAudio();

    if (bgmAudio.paused) {
        bgmAudio.currentTime = 0;
        bgmAudio.play().catch(e => {
            console.warn('[Audio] Could not auto-play background music:', e);
        });
        console.log('[Audio] Background music started');
    }
}

/**
 * Stop background music
 */
export function stopBackgroundMusic() {
    if (bgmAudio) {
        bgmAudio.pause();
        bgmAudio.currentTime = 0;
    }
}

// =========================================
// VICTORY / DEFEAT MUSIC
// =========================================

/**
 * Play victory music (stops BGM first)
 */
export function playVictoryMusic() {
    stopBackgroundMusic();
    preloadAudio();

    victoryAudio.currentTime = 0;
    victoryAudio.play().catch(e => {
        console.warn('[Audio] Could not play victory music:', e);
    });
    console.log('[Audio] Victory music playing');
}

/**
 * Play defeat music (stops BGM first)
 */
export function playDefeatMusic() {
    stopBackgroundMusic();
    preloadAudio();

    defeatAudio.currentTime = 0;
    defeatAudio.play().catch(e => {
        console.warn('[Audio] Could not play defeat music:', e);
    });
    console.log('[Audio] Defeat music playing');
}

// =========================================
// SFX - PARRY SOUNDS (using real audio files)
// =========================================

/**
 * Helper: play an SFX by cloning the audio node (allows overlapping playback)
 */
function playSFX(audioElement) {
    if (!audioElement) return;
    // Clone so that multiple SFX can overlap without cutting each other off
    const clone = audioElement.cloneNode();
    clone.volume = audioElement.volume;
    clone.play().catch(e => {
        console.warn('[Audio] SFX playback failed:', e);
    });
}

/**
 * Play normal parry sound (GOOD / imperfect parry)
 */
export function playParrySound(bounceCount = 0) {
    preloadAudio();
    console.log('[Audio] Playing SFX: parata normale.wav');
    playSFX(sfxParryNormal);
}

/**
 * Play perfect parry sound
 */
export function playPerfectParrySound() {
    preloadAudio();
    console.log('[Audio] Playing SFX: Parata perfetta 1.wav');
    playSFX(sfxParryPerfect);
}

/**
 * Play hit/miss sound (parata mancata / damage)
 */
export function playHitSound() {
    preloadAudio();
    console.log('[Audio] Playing SFX: parata mancata.wav');
    playSFX(sfxParryMiss);
}

/**
 * Play stalemate sound (keep synthesized for now, as no file provided)
 */
export function playStalemateSound() {
    if (!audioContext) initAudio();
    if (!audioContext) return;

    const osc1 = audioContext.createOscillator();
    const osc2 = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    osc1.frequency.setValueAtTime(523.25, audioContext.currentTime); // C5
    osc2.frequency.setValueAtTime(659.25, audioContext.currentTime); // E5
    osc1.type = 'sine';
    osc2.type = 'sine';

    gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.15, audioContext.currentTime + 0.3);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.6);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(audioContext.destination);

    osc1.start(audioContext.currentTime);
    osc2.start(audioContext.currentTime);
    osc1.stop(audioContext.currentTime + 0.6);
    osc2.stop(audioContext.currentTime + 0.6);
}

// =========================================
// TENSION LOOP (Web Audio API - synthesized)
// =========================================

/**
 * Start tension loop for long rallies
 */
export function startTensionLoop(bounceCount) {
    if (!audioContext) initAudio();
    if (!audioContext || bounceCount < 2) return;

    stopTensionLoop();

    tensionOscillator = audioContext.createOscillator();
    tensionGain = audioContext.createGain();

    const baseFreq = 60 + (bounceCount * 10);
    tensionOscillator.frequency.setValueAtTime(baseFreq, audioContext.currentTime);
    tensionOscillator.type = 'triangle';

    const volume = Math.min(0.1, 0.03 + (bounceCount * 0.02));
    tensionGain.gain.setValueAtTime(0, audioContext.currentTime);
    tensionGain.gain.linearRampToValueAtTime(volume, audioContext.currentTime + 0.2);

    tensionOscillator.connect(tensionGain);
    tensionGain.connect(audioContext.destination);

    tensionOscillator.start(audioContext.currentTime);
}

/**
 * Stop tension loop
 */
export function stopTensionLoop() {
    if (tensionOscillator) {
        try {
            tensionOscillator.stop();
        } catch (e) {
            // Already stopped
        }
        tensionOscillator = null;
    }
    if (tensionGain) {
        tensionGain = null;
    }
}

/**
 * Stop ALL audio (useful for game reset)
 */
export function stopAllAudio() {
    stopBackgroundMusic();
    stopTensionLoop();

    if (victoryAudio) {
        victoryAudio.pause();
        victoryAudio.currentTime = 0;
    }
    if (defeatAudio) {
        defeatAudio.pause();
        defeatAudio.currentTime = 0;
    }
}
