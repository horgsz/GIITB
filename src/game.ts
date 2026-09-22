import { PLAYER_COLORS, type Player, type ThrowResult } from './constants';

export interface RoundOutcome {
  pointHolder: Player;
  nextPlacer: Player;
}

type Stage = 'open' | 'steal';

/**
 * Turn and scoring rules.
 *
 * A round: the placer sets the bucket and feather once, then everyone throws from that
 * same spot in seating order, cycling as many times as it takes, until somebody makes it.
 * The first player to make it holds the point, and every other player then gets exactly
 * one throw to steal it. The last player to make it banks 1 point and places next round.
 */
export class Game {
  readonly players: Player[];
  placerIndex = 0;
  pointHolderIndex: number | null = null;
  lap = 1;

  private stage: Stage = 'open';
  private openIndex = 0;
  private stealQueue: number[] = [];
  private stealCursor = 0;
  private thrownThisLap = new Set<number>();

  constructor(names: string[]) {
    this.players = names.map((name, id) => ({
      id,
      name,
      color: PLAYER_COLORS[id % PLAYER_COLORS.length],
      score: 0
    }));
  }

  get placer(): Player {
    return this.players[this.placerIndex];
  }

  get isSolo(): boolean {
    return this.players.length === 1;
  }

  get currentPlayer(): Player {
    if (this.stage === 'open') return this.players[this.openIndex];
    const idx = this.stealQueue[Math.min(this.stealCursor, this.stealQueue.length - 1)];
    return this.players[idx];
  }

  get pointHolder(): Player | null {
    return this.pointHolderIndex === null ? null : this.players[this.pointHolderIndex];
  }

  /** True once somebody has made it and the others are attempting to steal. */
  get isStealPhase(): boolean {
    return this.stage === 'steal';
  }

  /** How many players still get a throw after the current one (steal phase only). */
  get throwsRemaining(): number {
    if (this.stage !== 'steal') return 0;
    return Math.max(0, this.stealQueue.length - this.stealCursor - 1);
  }

  /** Whether a player has already had their throw in the current pass. */
  hasThrown(index: number): boolean {
    if (this.stage === 'open') return this.thrownThisLap.has(index);
    const at = this.stealQueue.indexOf(index);
    return index === this.pointHolderIndex || (at !== -1 && at < this.stealCursor);
  }

  startRound() {
    this.stage = 'open';
    this.openIndex = this.placerIndex;
    this.pointHolderIndex = null;
    this.stealQueue = [];
    this.stealCursor = 0;
    this.thrownThisLap.clear();
    this.lap = 1;
  }

  /**
   * Applies a throw result. Returns the round outcome if the round is now over,
   * otherwise null (meaning another player is up from the same spot).
   */
  applyThrow(result: ThrowResult): RoundOutcome | null {
    if (this.stage === 'open') {
      if (result.scored) {
        this.pointHolderIndex = this.openIndex;
        this.stealQueue = [];
        for (let i = 1; i < this.players.length; i++) {
          this.stealQueue.push((this.openIndex + i) % this.players.length);
        }
        this.stealCursor = 0;
        this.stage = 'steal';
        return this.stealQueue.length === 0 ? this.endRound() : null;
      }

      // Nobody in yet — same spot, next player up, looping as many laps as it takes.
      this.thrownThisLap.add(this.openIndex);
      this.openIndex = (this.openIndex + 1) % this.players.length;
      if (this.openIndex === this.placerIndex) {
        this.lap++;
        this.thrownThisLap.clear();
      }
      return null;
    }

    if (result.scored) this.pointHolderIndex = this.stealQueue[this.stealCursor];
    this.stealCursor++;
    return this.stealCursor >= this.stealQueue.length ? this.endRound() : null;
  }

  private endRound(): RoundOutcome {
    const holder = this.players[this.pointHolderIndex!];
    holder.score++;
    this.placerIndex = holder.id;
    return { pointHolder: holder, nextPlacer: holder };
  }
}
