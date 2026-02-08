# Piano di Refactoring Sicuro - Analisi Rischi

## 📊 Analisi Dipendenze Attuali

### Export Pubblici da `rally.js` (solo 6 funzioni)
```javascript
✅ initRally()           // Usato in: game.js
✅ startRallyPhase()     // Usato in: game/input.js, game/ai.js
✅ attemptParry()         // Usato in: game/input.js
✅ finishRallyPhase()     // Usato in: game.js
✅ getRallyAttacker()     // Usato in: game.js
⚠️ spawnNextNote()       // DEPRECATED (non usato)
```

### File che Dipendono da `rally.js`
- `game.js` → 3 funzioni
- `game/input.js` → 2 funzioni
- `game/ai.js` → 1 funzione

**Totale: 3 file, 5 funzioni attive**

---

## ⚠️ Valutazione Rischi

### Rischio: **MEDIO-BASSO** ✅

**Perché è relativamente sicuro:**
1. ✅ Solo 5 funzioni esportate (6 con deprecated)
2. ✅ Solo 3 file dipendono da rally.js
3. ✅ API pubblica piccola e ben definita
4. ✅ Funzioni interne non esportate (possono essere spostate liberamente)
5. ✅ Pattern di init già stabilito (gameState passato via init)

**Rischi potenziali:**
1. ⚠️ gameState condiviso tramite closure (deve rimanere accessibile)
2. ⚠️ Funzioni interne chiamano altre funzioni interne (dipendenze interne)
3. ⚠️ State mutations sparse (gameState modificato in molti punti)

---

## 🛡️ Strategia di Refactoring Incrementale

### Approccio: **Strangler Fig Pattern** (sicuro e reversibile)

Invece di rifare tutto in una volta, spostiamo codice gradualmente mantenendo il file originale funzionante.

---

## 📋 Piano Step-by-Step (ZERO RISCHIO)

### **FASE 1: Preparazione (0% rischio)**
**Obiettivo**: Creare struttura senza toccare codice esistente

```
game/rally/
  ├── index.js          # Re-export tutto da rally.js originale
  └── (vuoto per ora)
```

**Cosa fare:**
1. Creare cartella `game/rally/`
2. Creare `game/rally/index.js` che re-esporta tutto da `../rally.js`
3. Aggiornare import in `game.js`, `input.js`, `ai.js`:
   ```javascript
   // Da: import { startRallyPhase } from './rally.js'
   // A:  import { startRallyPhase } from './rally/index.js'
   ```
4. **Test**: Il gioco deve funzionare identicamente

**Rischio**: 0% - solo re-export, nessun codice toccato

---

### **FASE 2: Spostare Utils (5% rischio)**
**Obiettivo**: Spostare funzioni helper senza dipendenze

```
game/rally/
  ├── index.js          # Re-export
  └── utils.js          # getLaneCenterX, getLaneYPositions
```

**Cosa fare:**
1. Spostare `getLaneCenterX()` e `getLaneYPositions()` in `utils.js`
2. Importare in `rally.js` originale
3. **Test**: Verificare che funzioni ancora

**Rischio**: 5% - funzioni pure, nessuna dipendenza

---

### **FASE 3: Spostare Effects (10% rischio)**
**Obiettivo**: Isolare effetti visivi

```
game/rally/
  ├── index.js
  ├── utils.js
  └── effects.js        # showImpactFeedback, showStaminaChange, showIdentityEffectFeedback
```

**Cosa fare:**
1. Spostare funzioni di feedback in `effects.js`
2. Importare in `rally.js` originale
3. **Test**: Verificare animazioni e feedback

**Rischio**: 10% - dipendono da gameState e renderFn (già disponibili)

---

### **FASE 4: Spostare Identity Logic (15% rischio)**
**Obiettivo**: Isolare logica identity cards

```
game/rally/
  ├── index.js
  ├── utils.js
  ├── effects.js
  └── identity.js       # applyIdentityEffect, applySpeedChange
```

**Cosa fare:**
1. Spostare logica identity in `identity.js`
2. Importare in `rally.js` originale
3. **Test**: Verificare effetti identity cards

**Rischio**: 15% - modifica gameState ma logica isolata

---

### **FASE 5: Spostare Note Logic (20% rischio)**
**Obiettivo**: Isolare creazione e gestione note

```
game/rally/
  ├── index.js
  ├── utils.js
  ├── effects.js
  ├── identity.js
  └── note.js           # scheduleNoteSpawns, handleNoteImpact
```

**Cosa fare:**
1. Spostare logica note in `note.js`
2. Importare in `rally.js` originale
3. **Test**: Verificare spawn e movimento note

**Rischio**: 20% - logica core ma ben isolata

---

### **FASE 6: Spostare Animation (25% rischio)**
**Obiettivo**: Isolare animazioni

```
game/rally/
  ├── index.js
  ├── utils.js
  ├── effects.js
  ├── identity.js
  ├── note.js
  └── animation.js      # animateNotes, bounceNote, triggerSpinAnimation
```

**Cosa fare:**
1. Spostare logica animazione in `animation.js`
2. Importare in `rally.js` originale
3. **Test**: Verificare animazioni fluide

**Rischio**: 25% - logica complessa ma già testata

---

### **FASE 7: Spostare Parry Logic (30% rischio)**
**Obiettivo**: Isolare logica parata

```
game/rally/
  ├── index.js
  ├── utils.js
  ├── effects.js
  ├── identity.js
  ├── note.js
  ├── animation.js
  └── parry.js          # attemptParry, handleParrySuccess, scheduleAIParryForNote
```

**Cosa fare:**
1. Spostare logica parata in `parry.js`
2. Importare in `rally.js` originale
3. **Test**: Verificare parate player e AI

**Rischio**: 30% - logica critica ma ben testata

---

### **FASE 8: Spostare Core Logic (35% rischio)**
**Obiettivo**: Mantenere solo entry points in rally.js

```
game/rally/
  ├── index.js          # Re-export tutto
  ├── utils.js
  ├── effects.js
  ├── identity.js
  ├── note.js
  ├── animation.js
  ├── parry.js
  └── core.js           # startRallyPhase, finishRallyPhase, checkRallyComplete, cleanupRally
```

**Cosa fare:**
1. Spostare funzioni core in `core.js`
2. Importare tutto in `rally.js` originale (wrapper)
3. **Test**: Verificare tutto il flusso

**Rischio**: 35% - ultimo step, ma tutto già testato

---

### **FASE 9: Cleanup Finale (10% rischio)**
**Obiettivo**: Rimuovere rally.js originale

**Cosa fare:**
1. Spostare `initRally()` in `index.js`
2. Eliminare `rally.js` originale
3. **Test**: Test completo del gioco

**Rischio**: 10% - solo cleanup, tutto già funzionante

---

## 🧪 Strategia di Testing per Ogni Fase

### Test Manuali Essenziali (5 minuti per fase)
1. ✅ Avvia gioco
2. ✅ Seleziona carta e assegna note
3. ✅ Parata con Q/W/E/R
4. ✅ Verifica contrattacco fluido
5. ✅ Verifica effetti visivi
6. ✅ Verifica AI parry
7. ✅ Verifica fine rally

### Test Automatici (opzionale ma consigliato)
```javascript
// test/rally.test.js
describe('Rally System', () => {
  test('startRallyPhase creates rally state', () => { /* ... */ });
  test('attemptParry handles perfect parry', () => { /* ... */ });
  test('bounceNote updates note correctly', () => { /* ... */ });
});
```

---

## 🔄 Rollback Plan (se qualcosa va storto)

### Per ogni fase:
1. **Git commit** prima di iniziare
2. Se test falliscono → `git reset --hard HEAD`
3. Se funziona → `git commit` e procedi

### Backup completo:
```bash
# Prima di iniziare
git checkout -b refactor-rally
git commit -am "Before refactor"

# Se tutto va male
git checkout main
git branch -D refactor-rally
```

---

## 📈 Timeline Stimata

- **Fase 1**: 10 minuti
- **Fase 2-4**: 30 minuti (10 min ciascuna)
- **Fase 5-7**: 1 ora (20 min ciascuna)
- **Fase 8-9**: 30 minuti
- **Testing**: 30 minuti

**Totale: ~3 ore** con testing completo

---

## ✅ Checklist Pre-Refactor

- [ ] Git commit pulito dello stato attuale
- [ ] Backup del progetto
- [ ] Test manuale completo del gioco funzionante
- [ ] Browser console aperta per vedere errori
- [ ] Tempo disponibile (3+ ore senza interruzioni)

---

## 🎯 Conclusione

**Rischio complessivo: MEDIO-BASSO (15-20%)**

**Perché è sicuro:**
- ✅ Approccio incrementale (un pezzo alla volta)
- ✅ Ogni fase testabile indipendentemente
- ✅ Rollback immediato disponibile
- ✅ API pubblica piccola e stabile
- ✅ Nessun cambiamento di comportamento atteso

**Quando NON farlo:**
- ❌ Se hai una deadline imminente
- ❌ Se non hai tempo per testare
- ❌ Se il gioco funziona perfettamente e non serve

**Quando farlo:**
- ✅ Se il progetto continuerà a crescere
- ✅ Se lavori in team
- ✅ Se vuoi facilitare manutenzione futura
- ✅ Se hai 3-4 ore disponibili

---

## 💡 Alternativa: Refactor Parziale

Se non vuoi rischiare, puoi fare solo le fasi 1-4 (utils, effects, identity):
- **Rischio**: <10%
- **Tempo**: 1 ora
- **Beneficio**: Isola codice meno critico, facilita manutenzione

Il resto può rimanere in `rally.js` originale.
