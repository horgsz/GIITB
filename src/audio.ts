/**
 * Cartoon sound effects, synthesised with WebAudio so the game ships no audio assets.
 *
 * Browsers block audio until a user gesture, so nothing is created until unlock() is
 * called from a click. Every call is a no-op if the context could not be created.
 */
export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;

  /** Must be called from a user gesture (the Start button). */
  unlock() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.32;
    this.master.connect(this.ctx.destination);
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.32;
  }

  get isMuted() {
    return this.muted;
  }

  private get t() {
    return this.ctx?.currentTime ?? 0;
  }

  /** A pitch-bending blip — the building block for most of these noises. */
  private blip(opts: {
    type: OscillatorType;
    from: number;
    to: number;
    dur: number;
    gain?: number;
    delay?: number;
    bend?: 'exp' | 'lin';
  }) {
    if (!this.ctx || !this.master) return;
    const { type, from, to, dur, gain = 0.5, delay = 0, bend = 'exp' } = opts;
    const t0 = this.t + delay;

    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    if (bend === 'exp') osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
    else osc.frequency.linearRampToValueAtTime(Math.max(1, to), t0 + dur);

    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** Short filtered noise burst, for thuds and rattles. */
  private noise(opts: { dur: number; freq: number; q?: number; gain?: number; delay?: number }) {
    if (!this.ctx || !this.master) return;
    const { dur, freq, q = 1, gain = 0.4, delay = 0 } = opts;
    const t0 = this.t + delay;

    const frames = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.value = gain;

    src.connect(filter).connect(g).connect(this.master);
    src.start(t0);
  }

  /** Ball on the ground: a rubbery boing that softens as the ball slows. */
  bounce(strength: number) {
    const s = Math.max(0.15, Math.min(1, strength));
    this.blip({ type: 'triangle', from: 300 + 420 * s, to: 90, dur: 0.16 + 0.1 * s, gain: 0.22 + 0.3 * s });
    this.noise({ dur: 0.05, freq: 900, gain: 0.1 * s });
  }

  /** Ball on the wall: flatter and harder than the ground. */
  wallHit(strength: number) {
    const s = Math.max(0.15, Math.min(1, strength));
    this.blip({ type: 'square', from: 200 + 260 * s, to: 70, dur: 0.12, gain: 0.16 + 0.22 * s });
    this.noise({ dur: 0.07, freq: 420, q: 0.8, gain: 0.22 * s });
  }

  /** Ball on the bucket: a hollow plastic donk. */
  bucketHit(strength: number) {
    const s = Math.max(0.2, Math.min(1, strength));
    this.blip({ type: 'sine', from: 440, to: 150, dur: 0.22, gain: 0.3 * s });
    this.blip({ type: 'triangle', from: 660, to: 240, dur: 0.14, gain: 0.16 * s, delay: 0.005 });
    this.noise({ dur: 0.06, freq: 1600, q: 2, gain: 0.14 * s });
  }

  /** Made it: a silly rising fanfare with a sparkle on top. */
  score() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) =>
      this.blip({ type: 'square', from: f, to: f, dur: 0.13, gain: 0.34, delay: i * 0.085 })
    );
    this.blip({ type: 'sine', from: 1046.5, to: 2093, dur: 0.35, gain: 0.22, delay: 0.34 });
    this.blip({ type: 'triangle', from: 1568, to: 1568, dur: 0.5, gain: 0.16, delay: 0.36 });
  }

  /** Sequence broken: a comedy descending "wah". */
  dead() {
    this.blip({ type: 'sawtooth', from: 330, to: 110, dur: 0.45, gain: 0.2, bend: 'lin' });
  }

  /** Round miss: sad trombone. */
  miss() {
    const steps = [311.13, 293.66, 277.18, 261.63];
    steps.forEach((f, i) =>
      this.blip({ type: 'sawtooth', from: f, to: f * 0.97, dur: 0.2, gain: 0.22, delay: i * 0.16, bend: 'lin' })
    );
    this.blip({ type: 'sawtooth', from: 261.63, to: 160, dur: 0.6, gain: 0.24, delay: 0.64, bend: 'lin' });
  }

  /** The point changes hands. */
  steal() {
    this.blip({ type: 'square', from: 400, to: 900, dur: 0.12, gain: 0.26 });
    this.blip({ type: 'square', from: 900, to: 1400, dur: 0.14, gain: 0.24, delay: 0.1 });
  }

  /** Light tick for placement and menu clicks. */
  click() {
    this.blip({ type: 'square', from: 900, to: 600, dur: 0.05, gain: 0.12 });
  }

  /** Winding noise while the power meter is swinging. */
  charge(power: number) {
    this.blip({ type: 'sine', from: 260 + power * 520, to: 260 + power * 520, dur: 0.05, gain: 0.05 });
  }

  /** Whoosh on release. */
  release(power: number) {
    this.noise({ dur: 0.18, freq: 500 + power * 1400, q: 0.6, gain: 0.22 });
  }
}
