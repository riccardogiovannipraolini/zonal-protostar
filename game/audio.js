// ===== AUDIO MODULE FOR RALLY SOUNDS =====
// Uses Web Audio API for synthesized game sounds

let audioContext = null;
let tensionOscillator = null;
let tensionGain = null;

/**
 * Initialize audio context (call on first user interaction)
 */
let bgmAudio = null;

export function initAudio() {
    if (audioContext) return;

    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        console.log('[Audio] AudioContext initialized');
    } catch (e) {
        console.warn('[Audio] Web Audio API not supported:', e);
    }
}

/**
 * Play background music continuously
 */
export function playBackgroundMusic() {
    if (!bgmAudio) {
        bgmAudio = new Audio('assets/music/COMBATTIMENTO_Base.mp3');
        bgmAudio.loop = true;
        bgmAudio.volume = 0.5; // Adjust volume if necessary
    }

    // Play only if it's paused or stopped
    if (bgmAudio.paused) {
        bgmAudio.play().catch(e => {
            console.warn('[Audio] Could not auto-play background music. Waiting for interaction.', e);
        });
    }
}

/**
 * Stop background music
 */
export function stopBackgroundMusic() {
    if (bgmAudio) {
        bgmAudio.pause();
        bgmAudio.currentTime = 0; // Reset to start
    }
}

let victoryAudio = null;
let defeatAudio = null;

/**
 * Play victory music
 */
export function playVictoryMusic() {
    stopBackgroundMusic();
    if (!victoryAudio) {
        victoryAudio = new Audio('assets/music/VITTORIA 1 PROVA.mp3');
        victoryAudio.volume = 0.5;
    }
    victoryAudio.play().catch(e => console.warn('[Audio] Could not auto-play victory music.', e));
}

/**
 * Play defeat music
 */
export function playDefeatMusic() {
    stopBackgroundMusic();
    if (!defeatAudio) {
        defeatAudio = new Audio('assets/music/SCONFITTA 1 PROVA.mp3');
        defeatAudio.volume = 0.5;
    }
    defeatAudio.play().catch(e => console.warn('[Audio] Could not auto-play defeat music.', e));
}

/**
 * Play parry sound with pitch based on bounce count
 */
export function playParrySound(bounceCount = 0) {
    if (!audioContext) initAudio();
    if (!audioContext) return;

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    // Base frequency increases with each bounce (pitch up)
    const baseFrequency = 400;
    const frequencyMultiplier = 1 + (bounceCount * 0.15);
    oscillator.frequency.setValueAtTime(baseFrequency * frequencyMultiplier, audioContext.currentTime);
    oscillator.type = 'sine';

    // Quick attack and decay
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.15);
}

/**
 * Play hit/slam sound when someone misses
 */
export function playHitSound() {
    if (!audioContext) initAudio();
    if (!audioContext) return;

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    // Low frequency for impact
    oscillator.frequency.setValueAtTime(80, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(40, audioContext.currentTime + 0.2);
    oscillator.type = 'sawtooth';

    // Punchy attack
    gainNode.gain.setValueAtTime(0.4, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.25);

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
}

/**
 * Play stalemate sound
 */
export function playStalemateSound() {
    if (!audioContext) initAudio();
    if (!audioContext) return;

    // Two-tone resolution sound
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

/**
 * Start tension loop for long rallies
 */
export function startTensionLoop(bounceCount) {
    if (!audioContext) initAudio();
    if (!audioContext || bounceCount < 2) return;

    stopTensionLoop();

    tensionOscillator = audioContext.createOscillator();
    tensionGain = audioContext.createGain();

    // Low rumbling frequency that increases with bounces
    const baseFreq = 60 + (bounceCount * 10);
    tensionOscillator.frequency.setValueAtTime(baseFreq, audioContext.currentTime);
    tensionOscillator.type = 'triangle';

    // Subtle volume
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
