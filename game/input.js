// ===== INPUT HANDLING =====

import { CARD, STAMINA } from '../data/cards.js';
import { getCanvas, layout, invalidateLayout } from '../render/canvas.js';
import { attemptParry, startRallyPhase } from './rally/index.js';
import { resetGameState } from './state.js';
import { isLanePlayable } from './rules.js';
import { playNoteAssignSound, playRallyLaunchSound } from './audio.js';

// Module-level references
let gameState = null;
let renderFn = null;
let endTurnFn = null;

/**
 * Initialize input module
 */
export function initInput(state, render, endTurn) {
    gameState = state;
    renderFn = render;
    endTurnFn = endTurn;
}

/**
 * Setup all event listeners
 */
export function setupEventListeners() {
    const canvas = getCanvas();

    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('contextmenu', handleContextMenu);
    canvas.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('keydown', handleKeyDown);
}

/**
 * Handle canvas click
 */
function handleClick(event) {
    if (gameState.animatingAttack) return;

    const { x, y } = getMousePosition(event);

    // GAME_OVER - Play Again button
    if (gameState.phase === 'GAME_OVER' && gameState.playAgainButton) {
        const btn = gameState.playAgainButton;
        if (x >= btn.x && x <= btn.x + btn.width &&
            y >= btn.y && y <= btn.y + btn.height) {
            resetGameState(gameState);
            renderFn();
            return;
        }
        return;
    }

    // RALLY - parry attempt
    if (gameState.phase === 'RALLY') {
        attemptParry();
        return;
    }

    // REPOSITION phase
    if (gameState.phase === 'REPOSITION' && gameState.currentTurn === 'player') {
        handleRepositionClick(x, y);
        return;
    }

    // SELECTION phase - select player card
    if (gameState.phase === 'SELECTION' && gameState.currentTurn === 'player') {
        for (let i = 0; i < layout.cardPositions.player.length; i++) {
            const pos = layout.cardPositions.player[i];
            if (x >= pos.x && x <= pos.x + pos.width &&
                y >= pos.y && y <= pos.y + pos.height) {
                const card = gameState.playerCards[i];
                if (card.pv <= 0) return; // Prevent selecting dead cards for Attack

                if (gameState.selectedCard === i) {
                    gameState.selectedCard = null;
                } else {
                    gameState.selectedCard = i;
                    gameState.phase = 'DISTRIBUTION';
                }
                renderFn();
                return;
            }
        }
    }

    // DISTRIBUTION phase
    if (gameState.phase === 'DISTRIBUTION' && gameState.currentTurn === 'player') {
        handleDistributionClick(x, y);
    }

    // IDENTITY CARD Interaction
    if (gameState.currentTurn === 'player' && (gameState.phase === 'SELECTION' || gameState.phase === 'DISTRIBUTION' || gameState.phase === 'REPOSITION')) {
        handleIdentityCardClick(x, y);
    }
}

/**
 * Handle clicks on Identity Cards (Activation)
 */
function handleIdentityCardClick(x, y) {
    const positions = layout.identityCardPositions.player;
    if (!positions) return;

    // Check both slots
    positions.forEach((pos, index) => {
        if (x >= pos.x && x <= pos.x + pos.width &&
            y >= pos.y && y <= pos.y + pos.height) {

            const card = gameState.playerIdentityCards[index];
            if (!card) return;

            // Activate Logic
            if (card.type === 'ACTIVE' && card.currentCooldown === 0 && !card.active) {
                if (gameState.playerStamina >= card.cost) {
                    // Activate!
                    gameState.playerStamina -= card.cost;
                    card.active = true;
                    card.currentCharges = card.charges;
                    card.currentCooldown = card.cooldown; // Start cooldown (will prevent re-use)

                    // Feedback
                    const floatingText = {
                        text: 'SHIELD ACTIVE!',
                        x: pos.x + pos.width / 2,
                        y: pos.y - 20,
                        opacity: 1,
                        color: '#2ecc71',
                        startTime: Date.now()
                    };
                    gameState.floatingTexts.push(floatingText);

                    renderFn();
                } else {
                    // Not enough stamina
                    const floatingText = {
                        text: 'Not enough Stamina!',
                        x: pos.x + pos.width / 2,
                        y: pos.y - 20,
                        opacity: 1,
                        color: '#e74c3c',
                        startTime: Date.now()
                    };
                    gameState.floatingTexts.push(floatingText);
                    renderFn();
                }
            }
        }
    });
}

/**
 * Handle distribution phase clicks
 */
function handleDistributionClick(x, y) {
    const selectedCard = gameState.playerCards[gameState.selectedCard];
    const maxNotes = Math.min(selectedCard.na, Math.floor(gameState.playerStamina / STAMINA.COST_PER_NOTE));

    const positions = layout.cardPositions;
    const laneBottomY = positions.player[0].y - 30;
    const buttonY = laneBottomY + 40;
    const buttonWidth = 140;
    const buttonHeight = 40;
    const buttonSpacing = 20;
    const cancelX = getCanvas().width / 2 - buttonWidth - buttonSpacing / 2;

    // Cancel button
    if (x >= cancelX && x <= cancelX + buttonWidth &&
        y >= buttonY && y <= buttonY + buttonHeight) {
        cancelDistribution();
        return;
    }

    // Launch button
    if (gameState.assignedNotes.length > 0) {
        const launchX = getCanvas().width / 2 + buttonSpacing / 2;
        if (x >= launchX && x <= launchX + buttonWidth &&
            y >= buttonY && y <= buttonY + buttonHeight) {
            scheduleAutoLaunch();
            return;
        }
    }

    // Lane clicks
    for (let i = 0; i < layout.lanePositions.length; i++) {
        const lane = layout.lanePositions[i];
        if (x >= lane.x && x <= lane.x + lane.width &&
            y >= lane.y && y <= lane.y + lane.height) {

            if (lane.disabled) return;
            if (!isLanePlayable(gameState, i)) return;

            const notesInLane = gameState.assignedNotes.filter(n => n === i).length;

            if (gameState.assignedNotes.length < maxNotes) {
                gameState.assignedNotes.push(i);
                playNoteAssignSound();
            } else if (notesInLane > 0) {
                const indexToRemove = gameState.assignedNotes.indexOf(i);
                if (indexToRemove !== -1) {
                    gameState.assignedNotes.splice(indexToRemove, 1);
                }
            }

            renderFn();

            // Auto-launch if max notes reached
            if (gameState.assignedNotes.length >= maxNotes && maxNotes > 0) {
                scheduleAutoLaunch();
            }
            return;
        }
    }
}

/**
 * Handle right-click for removing notes
 */
function handleContextMenu(event) {
    event.preventDefault();

    if (gameState.phase !== 'DISTRIBUTION' || gameState.currentTurn !== 'player') {
        return;
    }

    const { x, y } = getMousePosition(event);

    for (let i = 0; i < layout.lanePositions.length; i++) {
        const lane = layout.lanePositions[i];
        if (x >= lane.x && x <= lane.x + lane.width &&
            y >= lane.y && y <= lane.y + lane.height) {

            const indexToRemove = gameState.assignedNotes.indexOf(i);
            if (indexToRemove !== -1) {
                gameState.assignedNotes.splice(indexToRemove, 1);
                renderFn();
            }
            return;
        }
    }
}

// --- Auto-launch timer ---
let autoLaunchTimer = null;

function scheduleAutoLaunch() {
    // Cancel any pending auto-launch
    if (autoLaunchTimer) clearTimeout(autoLaunchTimer);

    autoLaunchTimer = setTimeout(() => {
        autoLaunchTimer = null;
        if (gameState.phase !== 'DISTRIBUTION' || gameState.assignedNotes.length === 0) return;

        // Launch confirmation SFX
        playRallyLaunchSound();

        // Launch rally
        gameState.playerStamina -= gameState.assignedNotes.length * STAMINA.COST_PER_NOTE;
        if (gameState.playerStamina < 0) gameState.playerStamina = 0;
        startRallyPhase('player', gameState.selectedCard);
    }, 150);
}

function cancelDistribution() {
    if (autoLaunchTimer) { clearTimeout(autoLaunchTimer); autoLaunchTimer = null; }
    gameState.phase = 'SELECTION';
    gameState.selectedCard = null;
    gameState.assignedNotes = [];
    renderFn();
}

/**
 * Handle keyboard input - QWER for all combat phases
 */
function handleKeyDown(event) {
    const key = event.key.toLowerCase();
    const keyToLane = { 'q': 0, 'w': 1, 'e': 2, 'r': 3 };
    const lane = keyToLane[key];

    // --- SPACE/ENTER: launch rally early ---
    if ((key === ' ' || key === 'enter') && gameState.phase === 'DISTRIBUTION' && gameState.currentTurn === 'player') {
        event.preventDefault();
        if (gameState.assignedNotes.length > 0) {
            scheduleAutoLaunch();
        }
        return;
    }

    // --- ESC: cancel distribution ---
    if (key === 'escape' && gameState.phase === 'DISTRIBUTION' && gameState.currentTurn === 'player') {
        event.preventDefault();
        cancelDistribution();
        return;
    }

    if (lane === undefined) return;

    // --- SELECTION phase: QWER picks a card ---
    if (gameState.phase === 'SELECTION' && gameState.currentTurn === 'player') {
        event.preventDefault();
        const card = gameState.playerCards[lane];
        if (!card || card.pv <= 0) return; // Dead card

        gameState.selectedCard = lane;
        gameState.phase = 'DISTRIBUTION';
        gameState.assignedNotes = [];
        renderFn();
        return;
    }

    // --- DISTRIBUTION phase: QWER assigns note to lane ---
    if (gameState.phase === 'DISTRIBUTION' && gameState.currentTurn === 'player') {
        event.preventDefault();
        if (!isLanePlayable(gameState, lane)) return;

        const selectedCard = gameState.playerCards[gameState.selectedCard];
        const maxNotes = Math.min(selectedCard.na, Math.floor(gameState.playerStamina / STAMINA.COST_PER_NOTE));

        if (gameState.assignedNotes.length < maxNotes) {
            gameState.assignedNotes.push(lane);
            playNoteAssignSound();
            // Visual flash
            gameState.laneFlash = { lane, startTime: Date.now() };
            renderFn();

            // Auto-launch if max reached
            if (gameState.assignedNotes.length >= maxNotes && maxNotes > 0) {
                scheduleAutoLaunch();
            }
        }
        return;
    }

    // --- RALLY phase: QWER parries ---
    if (gameState.phase === 'RALLY') {
        event.preventDefault();
        gameState.laneFlash = { lane, startTime: Date.now() };
        attemptParry(lane);
        renderFn();
    }
}

/**
 * Handle mouse move for hover effects
 */
function handleMouseMove(event) {
    const canvas = getCanvas();

    if (gameState.animatingAttack) {
        canvas.style.cursor = 'default';
        return;
    }

    const { x, y } = getMousePosition(event);

    let isOverInteractable = false;
    const prevHoveredLane = gameState.hoveredLane;
    const prevHoveredId = gameState.hoveredIdentityCard; // Track previous state
    gameState.hoveredLane = null;
    gameState.hoveredIdentityCard = null;

    // Check lanes in DISTRIBUTION phase
    if (gameState.phase === 'DISTRIBUTION' && gameState.currentTurn === 'player') {
        for (let i = 0; i < layout.lanePositions.length; i++) {
            const lane = layout.lanePositions[i];
            if (x >= lane.x && x <= lane.x + lane.width &&
                y >= lane.y && y <= lane.y + lane.height) {
                gameState.hoveredLane = i;
                isOverInteractable = true;
                break;
            }
        }

        // Check buttons
        const positions = layout.cardPositions;
        const laneBottomY = positions.player[0].y - 30;
        const buttonY = laneBottomY + 40;
        const buttonWidth = 120;
        const buttonHeight = 40;
        const buttonSpacing = 20;
        const cancelX = canvas.width / 2 - buttonWidth - buttonSpacing / 2;
        const confirmX = canvas.width / 2 + buttonSpacing / 2;

        if ((x >= cancelX && x <= cancelX + buttonWidth &&
            y >= buttonY && y <= buttonY + buttonHeight) ||
            (gameState.assignedNotes.length > 0 &&
                x >= confirmX && x <= confirmX + buttonWidth &&
                y >= buttonY && y <= buttonY + buttonHeight)) {
            isOverInteractable = true;
        }

        // Re-render if hover changed
        if (prevHoveredLane !== gameState.hoveredLane) {
            renderFn();
        }
    }

    // Check player cards
    if ((gameState.phase === 'SELECTION' || gameState.phase === 'DISTRIBUTION') &&
        gameState.currentTurn === 'player') {
        for (let i = 0; i < layout.cardPositions.player.length; i++) {
            const pos = layout.cardPositions.player[i];
            if (x >= pos.x && x <= pos.x + pos.width &&
                y >= pos.y && y <= pos.y + pos.height) {
                if (gameState.playerCards[i].pv > 0) {
                    isOverInteractable = true;
                }
                break;
            }
        }
    }

    // Check Identity Cards (Player Only for interaction)
    if (layout.identityCardPositions.player) {
        layout.identityCardPositions.player.forEach((pos, index) => {
            if (x >= pos.x && x <= pos.x + pos.width &&
                y >= pos.y && y <= pos.y + pos.height) {
                // Check if card exists
                if (gameState.playerIdentityCards && gameState.playerIdentityCards[index]) {
                    gameState.hoveredIdentityCard = { side: 'player', index: index };
                    isOverInteractable = true;
                }
            }
        });
    }

    // Check Identity Cards (Enemy - for tooltip only)
    /*
    if (layout.identityCardPositions.enemy) {
        layout.identityCardPositions.enemy.forEach((pos, index) => {
            if (x >= pos.x && x <= pos.x + pos.width &&
                y >= pos.y && y <= pos.y + pos.height) {
                if (gameState.enemyIdentityCards && gameState.enemyIdentityCards[index]) {
                    gameState.hoveredIdentityCard = { side: 'enemy', index: index };
                    isOverInteractable = true;
                }
            }
        });
    }
    */

    // Re-render if identity hover changed
    if (gameState.hoveredIdentityCard) renderFn();
    else if (!gameState.hoveredIdentityCard && typeof prevHoveredId !== 'undefined' && prevHoveredId) renderFn();

    canvas.style.cursor = isOverInteractable ? 'pointer' : 'default';
}

/**
 * Get mouse position relative to canvas
 */
function getMousePosition(event) {
    const canvas = getCanvas();
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
        x: (event.clientX - rect.left) * scaleX,
        y: (event.clientY - rect.top) * scaleY
    };
}

/**
 * Handle clicks during Reposition Phase
 */
function handleRepositionClick(x, y) {
    const canvas = getCanvas();
    const positions = layout.cardPositions;

    // Check "Skip Reposition" button
    const buttonWidth = 160;
    const buttonHeight = 40;
    const skipX = (canvas.width - buttonWidth) / 2;
    const skipY = canvas.height / 2; // Center screen? Or below cards? Let's put slightly above player cards.
    // Actually, let's put it clearly in the middle

    if (x >= skipX && x <= skipX + buttonWidth &&
        y >= skipY && y <= skipY + buttonHeight) {

        // Skip
        gameState.phase = 'SELECTION';
        gameState.selectedCard = null; // Clear any selection
        renderFn();
        return;
    }

    // Check Player Cards
    for (let i = 0; i < positions.player.length; i++) {
        const pos = positions.player[i];
        if (x >= pos.x && x <= pos.x + pos.width &&
            y >= pos.y && y <= pos.y + pos.height) {

            // If already swapped, can't click cards (should have auto-advanced, but safety check)
            if (gameState.repositionSwapUsed) return;

            if (gameState.selectedCard === i) {
                // Deselect
                gameState.selectedCard = null;
            } else if (gameState.selectedCard === null) {
                // Select first card
                gameState.selectedCard = i;
            } else {
                // Select second card -> SWAP
                const firstIndex = gameState.selectedCard;
                const secondIndex = i;

                swapCards(firstIndex, secondIndex);

                gameState.selectedCard = null;
                gameState.repositionSwapUsed = true;
                invalidateLayout(); // Recompute layout for new positions

                // Auto-advance to Selection phase after swap
                setTimeout(() => {
                    gameState.phase = 'SELECTION';
                    renderFn();
                }, 300); // Short delay to see the swap
            }
            renderFn();
            return;
        }
    }
}

/**
 * Swap two player cards
 */
function swapCards(index1, index2) {
    if (index1 === index2) return;

    const temp = gameState.playerCards[index1];
    gameState.playerCards[index1] = gameState.playerCards[index2];
    gameState.playerCards[index2] = temp;

    console.log(`[Reposition] Swapped cards at index ${index1} and ${index2}`);
}
