// 程序化背景音乐:用 Web Audio API 合成一段轻柔的五声音阶循环,零音频资源、零版权负担。
// 浏览器自动播放策略要求用户手势后才能出声,故 AudioContext 延迟到 setEnabled(true) 时创建
// (调用点均为点击手势:开始游戏 / 静音开关)。

const STEP_SECONDS = 0.3; // 每步时长(约 100 BPM 的八分音符)
const LOOKAHEAD_MS = 40; // 调度器轮询间隔
const SCHEDULE_AHEAD = 0.2; // 提前排布多少秒的音符
const MASTER_GAIN = 0.06; // 整体音量,压得很低当背景

// C 大调五声音阶的主旋律(MIDI 音高,null 为休止),16 步一循环。
const LEAD: (number | null)[] = [
  72,
  null,
  74,
  76,
  79,
  null,
  76,
  74,
  72,
  null,
  69,
  72,
  74,
  null,
  72,
  null,
];
// 每 4 步走一个低音根音。
const BASS: number[] = [48, 53, 55, 50];

function midiToFreq(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export class BackgroundMusic {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private nextNoteTime = 0;
  private step = 0;
  private playing = false;

  get enabled(): boolean {
    return this.playing;
  }

  /** 开/关背景音乐。必须在用户手势中调用(会创建 / 恢复 AudioContext)。 */
  setEnabled(on: boolean): void {
    if (on) this.startPlaying();
    else this.stopPlaying();
  }

  private startPlaying(): void {
    if (this.playing) return;
    const ctx = this.ctx ?? new AudioContext();
    this.ctx = ctx;
    void ctx.resume();
    if (!this.master) {
      const master = ctx.createGain();
      master.gain.value = MASTER_GAIN;
      master.connect(ctx.destination);
      this.master = master;
    }
    this.playing = true;
    this.nextNoteTime = ctx.currentTime + 0.08;
    this.step = 0;
    this.scheduler();
  }

  private stopPlaying(): void {
    this.playing = false;
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (this.ctx) void this.ctx.suspend();
  }

  private scheduler = (): void => {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || !this.playing) return;
    while (this.nextNoteTime < ctx.currentTime + SCHEDULE_AHEAD) {
      this.scheduleStep(this.step, this.nextNoteTime, ctx, master);
      this.nextNoteTime += STEP_SECONDS;
      this.step = (this.step + 1) % LEAD.length;
    }
    this.timer = setTimeout(this.scheduler, LOOKAHEAD_MS);
  };

  private scheduleStep(step: number, time: number, ctx: AudioContext, master: GainNode): void {
    const lead = LEAD[step];
    if (lead != null) this.tone(ctx, master, midiToFreq(lead), time, 0.26, "triangle", 0.5);
    if (step % 4 === 0) {
      const bass = BASS[step / 4];
      if (bass != null) this.tone(ctx, master, midiToFreq(bass), time, 0.5, "sine", 0.7);
    }
  }

  private tone(
    ctx: AudioContext,
    master: GainNode,
    freq: number,
    time: number,
    dur: number,
    type: OscillatorType,
    velocity: number,
  ): void {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(velocity, time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  }
}
