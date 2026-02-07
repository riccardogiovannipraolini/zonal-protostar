// ===== GAME ENTRY POINT =====
// 4v4 Card Battle Game - Modular Version

// Data imports
import { STAMINA } from './data/cards.js';

// State management
import { createGameState, resetGameState } from './game/state.js';

// Render imports
import { initCanvas, clearCanvas, updateCardPositions, getCanvas } from './render/canvas.js';
import { drawBattlefield, drawAllCards } from './render/cards.js';
import { drawPhaseIndicator, drawStaminaBars, drawRegenAnimation, drawFloatingTexts, drawMessage, drawGameOverScreen, drawBattleTimer, drawRepositionUI, drawTooltip } from './render/ui.js';
import { drawNoteDistributionOverlay } from './render/distribution.js';
import { drawRallyPhase } from './render/rally.js';

// Game logic imports
import { initRally, finishRallyPhase, getRallyAttacker } from './game/rally.js';
import { initAI, aiTurn } from './game/ai.js';
import { initInput, setupEventListeners } from './game/input.js';

// ===== INITIALIZATION =====

document.addEventListener('DOMContentLoaded', () => {
    // Setup canvas
    const canvasElement = document.getElementById('gameCanvas');
    initCanvas(canvasElement);

    // Create game state
    const gameState = createGameState();

    // Main render function
    function render() {
        clearCanvas();
        updateCardPositions();
        drawBattlefield();
        drawPhaseIndicator(gameState);
        drawBattleTimer(gameState);  // Battle timer (MM:SS)
        drawAllCards(gameState);
        drawStaminaBars(gameState);
        drawRegenAnimation(gameState);
        drawRallyPhase(gameState);
        drawNoteDistributionOverlay(gameState);
        drawRepositionUI(gameState);
        drawFloatingTexts(gameState);
        drawMessage(gameState);
        drawGameOverScreen(gameState);
        drawTooltip(gameState);
    }

    // End turn and switch players
    function endTurn(currentAttacker) {
        gameState.phase = 'END_TURN';
        render();

        setTimeout(() => {
            gameState.selectedCard = null;
            gameState.targetCard = null;
            gameState.animatingAttack = false;

            if (currentAttacker === 'player') {
                gameState.currentTurn = 'enemy';
                startTurnWithRegen('enemy');
            } else {
                gameState.currentTurn = 'player';
                startTurnWithRegen('player');
            }
        }, 500);
    }

    // Start turn with stamina regeneration
    function startTurnWithRegen(side) {
        const isPlayer = side === 'player';
        const currentStamina = isPlayer ? gameState.playerStamina : gameState.enemyStamina;
        const maxStamina = isPlayer ? gameState.playerMaxStamina : gameState.enemyMaxStamina;

        const regenAmount = Math.min(STAMINA.REGEN_PER_TURN, maxStamina - currentStamina);

        // Apply regen
        if (isPlayer) {
            gameState.playerStamina = Math.min(gameState.playerStamina + STAMINA.REGEN_PER_TURN, maxStamina);

            // Decrement Identity Card Cooldowns
            if (gameState.playerIdentityCards) {
                gameState.playerIdentityCards.forEach(card => {
                    if (card && card.currentCooldown > 0) {
                        card.currentCooldown--;
                    }
                });
            }
        } else {
            gameState.enemyStamina = Math.min(gameState.enemyStamina + STAMINA.REGEN_PER_TURN, maxStamina);
            // Decrement Enemy Identity Card Cooldowns
            if (gameState.enemyIdentityCards) {
                gameState.enemyIdentityCards.forEach(card => {
                    if (card && card.currentCooldown > 0) {
                        card.currentCooldown--;
                    }
                });
            }
        }

        // Show regen animation
        if (regenAmount > 0) {
            gameState.regenAnimation = {
                side: side,
                amount: regenAmount,
                startTime: Date.now()
            };
        }

        const newStamina = isPlayer ? gameState.playerStamina : gameState.enemyStamina;

        if (newStamina === 0) {
            // Auto-skip turn due to exhaustion
            gameState.phase = 'SELECTION'; // Skip reposition if exhausted? Or allow it? Let's skip to keep it simple.
            render();

            showExhaustedMessage(isPlayer);

            setTimeout(() => {
                gameState.assignedNotes = [];
                endTurn(side);
            }, 1200);
        } else {
            // Normal turn start -> REPOSITION Phase
            gameState.repositionSwapUsed = false;
            gameState.phase = 'REPOSITION';
            render();

            if (!isPlayer) {
                // AI Turn: Reposition -> Selection
                setTimeout(() => {
                    // TODO: call AI Reposition logic here
                    import('./game/ai.js').then(module => {
                        module.aiRepositionPhase(); // We will implement this
                    });
                }, 500);
            }
        }
    }

    // Show exhausted message
    function showExhaustedMessage(isPlayer) {
        const canvas = getCanvas();
        const floatingText = {
            text: 'No Stamina!',
            x: canvas.width / 2,
            y: isPlayer ? canvas.height - 100 : 100,
            opacity: 1,
            color: '#ff4757',
            startTime: Date.now()
        };
        gameState.floatingTexts.push(floatingText);

        const textDuration = 1500;
        const animateText = () => {
            const elapsed = Date.now() - floatingText.startTime;
            const progress = elapsed / textDuration;

            if (progress < 1) {
                floatingText.y = (isPlayer ? canvas.height - 100 : 100) - (progress * 30);
                floatingText.opacity = 1 - progress;
                render();
                requestAnimationFrame(animateText);
            } else {
                gameState.floatingTexts = gameState.floatingTexts.filter(t => t !== floatingText);
                render();
            }
        };
        requestAnimationFrame(animateText);
    }

    // Initialize modules with references
    initRally(gameState, render, endTurn);
    initAI(gameState, render);
    initInput(gameState, render, endTurn);

    // Setup event listeners
    setupEventListeners();

    // Initial render
    render();

    // Expose for debugging
    window.gameState = gameState;
    window.render = render;

    console.log('Game initialized - Modular version');
});

