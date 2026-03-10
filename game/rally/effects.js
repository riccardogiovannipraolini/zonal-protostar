import { getCanvas } from '../../render/canvas.js';
import { playParrySound, playPerfectParrySound, playHitSound, playStalemateSound, stopTensionLoop } from '../audio.js';
import { getLaneCenterX } from './utils.js';
import { layout } from '../../render/canvas.js';
import { CARD } from '../../data/cards.js'; // Need these for thorns/resurrect feedback positions if used here

/**
 * Show impact feedback
 */
export function showImpactFeedback(gameState, result, note, renderFn) {
    const x = note.endX;
    const y = note.endY - 40;

    let text, color;
    if (result === 'PERFECT') {
        text = 'PERFECT!';
        color = '#2ecc71'; // Green
        playPerfectParrySound();
    } else if (result === 'GOOD') {
        text = 'GOOD';
        color = '#f1c40f'; // Yellow
        playParrySound();
    } else if (result === 'RETURN') {
        text = '↩ RETURN!';
        color = '#f1c40f';
        playParrySound();
    } else if (result === 'PARRY') {
        text = 'PARRY!';
        color = '#2ecc71';
        playPerfectParrySound();
    } else if (result === 'STALEMATE') {
        text = '⚡ STALEMATE ⚡';
        color = '#9b59b6';
        playStalemateSound();
        stopTensionLoop();
    } else if (result === 'FIZZLE') {
        text = '~poof~';
        color = '#888888';
        // No sound for fizzle
    } else {
        text = 'HIT!';
        color = '#e74c3c';
        playHitSound();
        stopTensionLoop();
    }

    const floatingText = {
        text, x, y,
        opacity: 1,
        color,
        startTime: Date.now()
    };
    gameState.floatingTexts.push(floatingText);

    const textDuration = 1000;
    const animateText = () => {
        const elapsed = Date.now() - floatingText.startTime;
        const progress = elapsed / textDuration;

        if (progress < 1) {
            floatingText.y = y - (progress * 50);
            floatingText.opacity = 1 - progress;
            if (renderFn) renderFn(); // Use the batched render
            requestAnimationFrame(animateText);
        } else {
            gameState.floatingTexts = gameState.floatingTexts.filter(t => t !== floatingText);
            if (renderFn) renderFn();
        }
    };
    requestAnimationFrame(animateText);

    // Shake on HIT
    if (result === 'HIT') {
        triggerShake(gameState, note, renderFn);
    }
}

/**
 * Trigger shake animation
 */
function triggerShake(gameState, note, renderFn) {
    // Clear any existing shake
    if (gameState.shakeInterval) {
        clearInterval(gameState.shakeInterval);
        gameState.shakeInterval = null;
    }

    const damagedSide = note.direction === 'toPlayer' ? 'player' : 'enemy';
    const bounceCount = note.bounceCount || 0;
    const maxShakeFrames = 10 + (bounceCount * 2);

    gameState.shakeCard = {
        side: damagedSide,
        index: note.lane,
        frames: 0,
        intensity: 1 + (bounceCount * 0.3)
    };

    let shakeFrames = 0;
    gameState.shakeInterval = setInterval(() => {
        shakeFrames++;

        // Safety check
        if (gameState.shakeCard) {
            gameState.shakeCard.frames = shakeFrames;
            if (renderFn) renderFn();
        } else {
            // If shakeCard is null (e.g. game reset), stop
            clearInterval(gameState.shakeInterval);
            gameState.shakeInterval = null;
            return;
        }

        if (shakeFrames >= maxShakeFrames) {
            if (gameState.shakeInterval) {
                clearInterval(gameState.shakeInterval);
                gameState.shakeInterval = null;
            }
            gameState.shakeCard = null;
            if (renderFn) renderFn(); // Ensure one last render to clear shake
        }
    }, 50);
}

/**
 * Show floating text for stamina change
 */
export function showStaminaChange(gameState, amount, side, renderFn) {
    const canvas = getCanvas();
    const isPlayer = side === 'player';
    const x = isPlayer ? 150 : 150; // Near stamina bars
    const y = isPlayer ? canvas.height - 50 : 50;

    const text = amount > 0 ? `+${amount}⚡` : `${amount}⚡`;
    const color = amount > 0 ? '#ffd700' : '#ff4757';

    const floatingText = {
        text, x, y,
        opacity: 1,
        color,
        startTime: Date.now()
    };
    gameState.floatingTexts.push(floatingText);

    // Animate
    const textDuration = 800;
    const animateText = () => {
        const elapsed = Date.now() - floatingText.startTime;
        const progress = elapsed / textDuration;

        if (progress < 1) {
            floatingText.y = y - (progress * 20);
            floatingText.opacity = 1 - progress;
            if (renderFn) renderFn();
            requestAnimationFrame(animateText);
        } else {
            gameState.floatingTexts = gameState.floatingTexts.filter(t => t !== floatingText);
            if (renderFn) renderFn();
        }
    };
    requestAnimationFrame(animateText);
}

/**
 * Show feedback for identity effect
 */
export function showIdentityEffectFeedback(gameState, noteOrPos, text, color, renderFn) {
    // Handle both note object or simple position object {x, y}
    const x = noteOrPos.x || noteOrPos.startX || 0;
    const y = noteOrPos.y || noteOrPos.startY || 0;

    const floatingText = {
        text: text,
        x: x,
        y: y,
        opacity: 1,
        color: color,
        startTime: Date.now()
    };
    gameState.floatingTexts.push(floatingText);

    // Start animation loop for this text
    const textDuration = 1000;
    const animateText = () => {
        // Check if text still exists in state (it might be cleared on reset)
        if (!gameState.floatingTexts.includes(floatingText)) return;

        const elapsed = Date.now() - floatingText.startTime;
        const progress = elapsed / textDuration;

        if (progress < 1) {
            floatingText.y -= 0.5; // Slow float up
            floatingText.opacity = 1 - progress;
            if (renderFn) renderFn();
            requestAnimationFrame(animateText);
        } else {
            // Remove self from state
            gameState.floatingTexts = gameState.floatingTexts.filter(t => t !== floatingText);
            if (renderFn) renderFn();
        }
    };
    requestAnimationFrame(animateText);
}
