// 极简 WebAudio 合成音效（无外部资源）
export class Sfx {
  private ctx: AudioContext | null = null;

  ensure() {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo > 0) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  shoot() {
    this.tone(760, 0.08, 'square', 0.045, 320);
  }
  enemyShoot() {
    this.tone(300, 0.1, 'sawtooth', 0.04, 150);
  }
  hit() {
    this.tone(190, 0.09, 'square', 0.08, 90);
  }
  boom() {
    this.tone(120, 0.45, 'sawtooth', 0.16, 38);
  }
  playerHit() {
    this.tone(140, 0.3, 'square', 0.14, 55);
  }
}
