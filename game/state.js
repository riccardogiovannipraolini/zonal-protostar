// ===== GAME STATE MANAGEMENT =====

import { PLAYER_CARDS, ENEMY_CARDS, STAMINA } from '../data/cards.js';

/**
 * Create a fresh game state
 */
export function createGameState() {
    return {
        // Phase management
        phase: 'SELECTION', // SELECTION, DISTRIBUTION, RALLY, END_TURN, GAME_OVER
        currentTurn: 'player',

        // Selection state
        selectedCard: null,
        targetCard: null,
        assignedNotes: [],
        hoveredLane: null,

        // Animation flags
        animatingAttack: false,
        shakeCard: null, // { side, index, frames }
        message: null,   // { text, frames }

        // Rally state machine
        rallyState: null,
        /* rallyState structure when active:
        {
            attacker: 'player'|'enemy',
            attackerIndex: number,
            lanes: number[],           // Queue of lanes to process
            currentLaneIndex: number,  // Index in lanes array
            currentDefender: 'player'|'enemy',
            bounceCount: number,
            notePhase: 'SPAWNING'|'TRAVELING'|'PARRY_WINDOW'|'IMPACTING'|'DELAY'|'DONE'
        }
        */

        // Current note being animated
        currentNote: null,
        /* currentNote structure:
        {
            lane: number,
            progress: 0-1,
            startTime: timestamp,
            duration: ms,
            startX, startY, endX, endY,
            x, y, // Current position
            direction: 'toEnemy'|'toPlayer'
        }
        */

        // Timing and results
        timingIndicator: null,
        rallyResults: [],
        parryAttempted: false,

        // Stamina system
        playerStamina: STAMINA.MAX,
        playerMaxStamina: STAMINA.MAX,
        enemyStamina: STAMINA.MAX,
        enemyMaxStamina: STAMINA.MAX,
        regenAnimation: null,

        // Cards (deep copy to allow modification)
        playerCards: PLAYER_CARDS.map(c => ({ ...c })),
        enemyCards: ENEMY_CARDS.map(c => ({ ...c })),

        // UI state
        floatingTexts: [],
        gameOver: null,
        aiParryFlash: null,
        playAgainButton: null,

        // Battle timer
        battleStartTime: Date.now()
    };
}

/**
 * Reset game state for a new game
 */
export function resetGameState(state) {
    // Reset cards
    state.playerCards = PLAYER_CARDS.map(c => ({ ...c }));
    state.enemyCards = ENEMY_CARDS.map(c => ({ ...c }));

    // Reset core state
    state.phase = 'SELECTION';
    state.currentTurn = 'player';
    state.selectedCard = null;
    state.targetCard = null;
    state.assignedNotes = [];
    state.hoveredLane = null;
    state.animatingAttack = false;
    state.shakeCard = null;
    state.message = null;

    // Reset rally
    state.rallyState = null;
    state.currentNote = null;
    state.timingIndicator = null;
    state.rallyResults = [];
    state.parryAttempted = false;

    // Reset stamina
    state.playerStamina = STAMINA.MAX;
    state.enemyStamina = STAMINA.MAX;
    state.regenAnimation = null;

    // Reset UI
    state.floatingTexts = [];
    state.gameOver = null;
    state.aiParryFlash = null;

    // Reset battle timer
    state.battleStartTime = Date.now();
}
