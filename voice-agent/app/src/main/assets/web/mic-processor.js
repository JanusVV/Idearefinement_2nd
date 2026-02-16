/**
 * AudioWorklet processor for microphone capture (replaces deprecated ScriptProcessorNode).
 * Accumulates samples into chunks of CHUNK_SIZE, computes RMS, and posts to main thread.
 */
const CHUNK_SIZE = 4096;

class MicProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(CHUNK_SIZE);
    this.offset = 0;
  }

  process(inputs, _outputs, _parameters) {
    const input = inputs[0]?.[0];
    if (!input || input.length === 0) return true;
    const rate = input.length;
    for (let i = 0; i < rate; i++) {
      this.buffer[this.offset++] = input[i];
      if (this.offset >= CHUNK_SIZE) {
        let sum = 0;
        for (let j = 0; j < CHUNK_SIZE; j++) sum += this.buffer[j] * this.buffer[j];
        const rms = Math.sqrt(sum / CHUNK_SIZE);
        const copy = new Float32Array(this.buffer);
        this.port.postMessage({ samples: copy, rms }, [copy.buffer]);
        this.offset = 0;
      }
    }
    return true;
  }
}

registerProcessor('mic-processor', MicProcessor);
