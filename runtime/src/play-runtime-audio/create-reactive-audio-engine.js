export class AudioEngine {
  constructor(state) {
    this.state = state;
    this.enabled = false;
    this.energy = 0;
    this.context = null;
    this.analyser = null;
    this.data = null;
  }

  async toggle() {
    if (!this.context) this.create();
    if (this.context.state !== "running") await this.context.resume();
    this.enabled = !this.enabled;
    this.gain.gain.setTargetAtTime(this.enabled ? 0.07 : 0, this.context.currentTime, 0.08);
    this.state.set("audio", this.enabled ? "on" : "off");
    return this.enabled;
  }

  create() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.context = new AudioContext();
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 128;
    this.data = new Uint8Array(this.analyser.frequencyBinCount);
    this.gain = this.context.createGain();
    this.gain.gain.value = 0;

    const low = this.context.createOscillator();
    const high = this.context.createOscillator();
    low.frequency.value = 74;
    high.frequency.value = 149;
    low.type = "sine";
    high.type = "triangle";

    low.connect(this.gain);
    high.connect(this.gain);
    this.gain.connect(this.analyser);
    this.analyser.connect(this.context.destination);
    low.start();
    high.start();
  }

  update() {
    if (!this.enabled || !this.analyser) {
      this.energy *= 0.94;
      return this.energy;
    }
    this.analyser.getByteFrequencyData(this.data);
    let sum = 0;
    for (let i = 0; i < this.data.length; i += 1) sum += this.data[i];
    const target = sum / (this.data.length * 255);
    this.energy += (target - this.energy) * 0.08;
    return this.energy;
  }
}
