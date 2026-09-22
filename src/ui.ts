import { PLAYER_COLORS, type Player } from './constants';
import type { Game } from './game';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export class Ui {
  private scoreboard = $<HTMLDivElement>('scoreboard');
  private bannerPlayer = $<HTMLDivElement>('banner-player');
  private bannerInstruction = $<HTMLDivElement>('banner-instruction');
  private powerWrap = $<HTMLDivElement>('power-wrap');
  private powerFill = $<HTMLDivElement>('power-fill');
  private resultPanel = $<HTMLDivElement>('result-panel');
  private resultTitle = $<HTMLDivElement>('result-title');
  private resultDetail = $<HTMLDivElement>('result-detail');
  private resultNext = $<HTMLButtonElement>('result-next');
  private setupModal = $<HTMLDivElement>('setup');
  private countInput = $<HTMLInputElement>('player-count');
  private countOptions = $<HTMLDivElement>('player-count-options');
  private nameList = $<HTMLDivElement>('name-list');
  private startBtn = $<HTMLButtonElement>('start-game');
  private throwBtn = $<HTMLButtonElement>('throw-btn');
  private sequence = $<HTMLDivElement>('sequence');
  private seqGround = $<HTMLSpanElement>('seq-ground');
  private seqWall = $<HTMLSpanElement>('seq-wall');
  private seqBucket = $<HTMLSpanElement>('seq-bucket');
  private seqFail = $<HTMLDivElement>('seq-fail');
  private muteBtn = $<HTMLButtonElement>('mute-btn');

  constructor() {
    this.syncCountButtons();
    this.renderNameInputs();
    this.countInput.addEventListener('input', () => {
      this.syncCountButtons();
      this.renderNameInputs();
    });
    this.countOptions.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.player-count-btn');
      if (!button) return;
      this.countInput.value = button.dataset.count ?? '1';
      this.syncCountButtons();
      this.renderNameInputs();
    });
  }

  onMuteToggle(handler: (muted: boolean) => void) {
    let muted = false;
    this.muteBtn.addEventListener('click', () => {
      muted = !muted;
      this.muteBtn.textContent = muted ? '🔇' : '🔊';
      this.muteBtn.classList.toggle('muted', muted);
      handler(muted);
    });
  }

  /** Press-and-hold throw button, shown only on touch devices. */
  onThrowButton(down: () => void, up: () => void) {
    this.throwBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.throwBtn.classList.add('charging');
      down();
    });
    const release = () => {
      if (!this.throwBtn.classList.contains('charging')) return;
      this.throwBtn.classList.remove('charging');
      up();
    };
    this.throwBtn.addEventListener('pointerup', release);
    this.throwBtn.addEventListener('pointercancel', release);
  }

  setThrowButtonVisible(visible: boolean) {
    this.throwBtn.classList.toggle('hidden', !visible);
    if (!visible) this.throwBtn.classList.remove('charging');
  }

  onStart(handler: (names: string[]) => void) {
    this.startBtn.addEventListener('click', () => {
      const inputs = Array.from(this.nameList.querySelectorAll<HTMLInputElement>('input'));
      const names = inputs.map((el, i) => el.value.trim() || `Player ${i + 1}`);
      this.setupModal.classList.add('hidden');
      handler(names);
    });
  }

  onContinue(handler: () => void) {
    this.resultNext.addEventListener('click', () => {
      this.hideResult();
      handler();
    });
  }

  private renderNameInputs() {
    const n = Math.max(1, Math.min(8, Number(this.countInput.value) || 1));
    const existing = Array.from(this.nameList.querySelectorAll<HTMLInputElement>('input')).map(
      (el) => el.value
    );
    this.nameList.innerHTML = '';
    for (let i = 0; i < n; i++) {
      const row = document.createElement('div');
      row.className = 'name-row';

      const swatch = document.createElement('span');
      swatch.className = 'swatch';
      swatch.style.background = PLAYER_COLORS[i % PLAYER_COLORS.length];

      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = `Player ${i + 1}`;
      input.value = existing[i] ?? '';

      row.append(swatch, input);
      this.nameList.append(row);
    }
  }

  private syncCountButtons() {
    const selected = this.countInput.value;
    for (const button of this.countOptions.querySelectorAll<HTMLButtonElement>('.player-count-btn')) {
      const active = button.dataset.count === selected;
      button.classList.toggle('selected', active);
      button.setAttribute('aria-checked', String(active));
    }
  }

  renderScores(game: Game, activeId: number | null) {
    const rows = game.players
      .map((p) => {
        const classes = ['score-row'];
        if (p.id === activeId) classes.push('active');
        if (game.pointHolder?.id === p.id) classes.push('holder');
        if (p.id !== activeId && game.hasThrown(p.id)) classes.push('done');
        return `<div class="${classes.join(' ')}">
            <span class="swatch" style="background:${p.color}"></span>
            <span class="name">${escapeHtml(p.name)}</span>
            <span class="pts">${p.score}</span>
          </div>`;
      })
      .join('');
    this.scoreboard.innerHTML = `<h2>${game.players.length === 1 ? 'Solo score' : 'Scoreboard'}</h2>${rows}`;
  }

  /** Live ground → wall → bucket state while the ball is in the air. */
  setSequence(state: { ground: boolean; wall: boolean; dead: boolean; text: string } | null) {
    if (!state) {
      this.sequence.classList.add('hidden');
      return;
    }
    this.sequence.classList.remove('hidden');

    const mark = (el: HTMLElement, done: boolean) => {
      el.classList.toggle('done', done && !state.dead);
      el.classList.toggle('dead', state.dead && !done);
    };
    mark(this.seqGround, state.ground);
    mark(this.seqWall, state.wall);
    mark(this.seqBucket, false);
    this.seqBucket.classList.toggle('dead', state.dead);
    this.seqFail.textContent = state.text;
  }

  setBanner(player: Player | null, instruction: string) {
    this.bannerPlayer.textContent = player ? player.name : '';
    this.bannerPlayer.style.color = player ? player.color : '';
    this.bannerInstruction.textContent = instruction;
  }

  setPower(value: number | null) {
    if (value === null) {
      this.powerWrap.classList.remove('visible');
      return;
    }
    this.powerWrap.classList.add('visible');
    this.powerFill.style.height = `${Math.round(value * 100)}%`;
  }

  showResult(title: string, detail: string, good: boolean, buttonLabel: string) {
    this.resultTitle.textContent = title;
    this.resultTitle.className = good ? 'good' : 'bad';
    this.resultDetail.textContent = detail;
    this.resultNext.textContent = buttonLabel;
    this.resultPanel.classList.remove('hidden');
  }

  hideResult() {
    this.resultPanel.classList.add('hidden');
  }
}

function escapeHtml(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
  );
}
