// ===== GAME STATE MANAGEMENT =====

import { PLAYER_CARDS, ENEMY_CARDS, STAMINA, IDENTITY_CARDS } from '../data/cards.js';
import { calculateChordBonuses } from './chords.js';
import { stopAllAudio, playBackgroundMusic } from './audio.js';

/**
 * Create a fresh game state
 */
export function createGameState() {
    const initialState = {
        // Phase management
        phase: 'SELECTION', // SELECTION, DISTRIBUTION, RALLY, END_TURN, GAME_OVER, REPOSITION
        currentTurn: 'player',
        repositionSwapUsed: false,

        // Selection state
        selectedCard: null,
        targetCard: null,
        assignedNotes: [],
        hoveredLane: null,
        hoveredIdentityCard: null, // { side: 'player'|'enemy', index: number }

        // Animation flags
        animatingAttack: false,
        shakeCard: null, // { side, index, frames }
        shakeInterval: null, // Interval ID for shake animation
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

        // Current note being animated (for backwards compatibility)
        currentNote: null,

        // Multiple active notes for simultaneous launch
        activeNotes: [],

        // Animation state flag to prevent multiple animation loops
        isAnimating: false,

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

        // Passive Tracking
        playerPassivesUsed: {}, // { cardIndex: true }
        enemyPassivesUsed: {},
        playerLaneDebuffs: [0, 0, 0, 0], // Speed reduction per lane (e.g., 0.2)
        enemyLaneDebuffs: [0, 0, 0, 0],

        // Cards (deep copy to allow modification)
        playerCards: PLAYER_CARDS.map(c => ({ ...c })),
        enemyCards: ENEMY_CARDS.map(c => ({ ...c })),

        // Identity Cards (New)
        // Format: [LeftCard, RightCard]
        // Player: Left=[Metronomo], Right=[Scudo] (cloned)
        playerIdentityCards: [
            {
                id: 'METRONOMO',
                name: 'Metronomo Spezzato',
                type: 'PASSIVE',
                description: 'Notes crossing center lane get -0.15 speed',
                effect: 'SLOW',
                value: 0.85,
                cost: 0,
                cooldown: 0,
                instanceId: 'p_id_0'
            },
            {
                id: 'SCUDO',
                name: 'Scudo Armonico',
                type: 'ACTIVE',
                description: 'Spend 4 Stamina: Next 3 notes crossing get -50% speed. CD: 3.',
                effect: 'SHIELD',
                value: 0.5,
                charges: 3,
                cost: 4,
                cooldown: 3,
                instanceId: 'p_id_1',
                currentCooldown: 0,
                active: false,
                currentCharges: 0
            }
        ],
        enemyIdentityCards: [
            {
                id: 'METRONOMO',
                name: 'Metronomo Spezzato',
                type: 'PASSIVE',
                description: 'Notes crossing center lane get -0.15 speed',
                effect: 'SLOW',
                value: 0.85,
                cost: 0,
                cooldown: 0,
                instanceId: 'e_id_0'
            },
            {
                id: 'SCUDO',
                name: 'Scudo Armonico',
                type: 'ACTIVE',
                description: 'Spend 4 Stamina: Next 3 notes crossing get -50% speed. CD: 3.',
                effect: 'SHIELD',
                value: 0.5,
                charges: 3,
                cost: 4,
                cooldown: 3,
                instanceId: 'e_id_1',
                currentCooldown: 0,
                active: false,
                currentCharges: 0
            }
        ],

        // UI state
        floatingTexts: [],
        gameOver: null,
        aiParryFlash: null,
        playAgainButton: null,

        // Battle timer
        battleStartTime: Date.now()
    };

    // Apply musical chord bonuses
    calculateChordBonuses(initialState.playerCards);
    calculateChordBonuses(initialState.enemyCards);

    // DEBUG: Verify Identity Cards
    console.log('[State] Identity Cards Raw:', IDENTITY_CARDS);
    console.log('[State] Player Identity Cards:', initialState.playerIdentityCards);
    console.log('[State] Enemy Identity Cards:', initialState.enemyIdentityCards);

    return initialState;
}

/**
 * Reset game state for a new game
 */
export function resetGameState(state) {
    // Reset cards
    state.playerCards = PLAYER_CARDS.map(c => ({ ...c }));
    state.enemyCards = ENEMY_CARDS.map(c => ({ ...c }));


    // Apply chord bonuses
    calculateChordBonuses(state.playerCards);
    calculateChordBonuses(state.enemyCards);

    // Reset core state
    state.phase = 'SELECTION';
    state.currentTurn = 'player';
    state.repositionSwapUsed = false;
    state.selectedCard = null;
    state.targetCard = null;
    state.assignedNotes = [];
    state.hoveredLane = null;
    state.hoveredIdentityCard = null;
    state.animatingAttack = false;
    if (state.shakeInterval) clearInterval(state.shakeInterval);
    state.shakeInterval = null;
    state.shakeCard = null;
    state.message = null;

    // Reset rally
    state.rallyState = null;
    state.currentNote = null;
    state.activeNotes = [];
    state.isAnimating = false;
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

    // Reset audio: stop victory/defeat music, restart BGM
    stopAllAudio();
    playBackgroundMusic();
}
