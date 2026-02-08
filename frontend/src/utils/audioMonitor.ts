export interface SilenceMonitor {
  stop: () => void;
  resetTimer: () => void;
}

interface SilenceMonitorOptions {
  silenceMs: number;
  threshold?: number;
  sampleIntervalMs?: number;
  onSilence: () => void;
  onSound?: () => void;
}

export function createSilenceMonitor(
  stream: MediaStream,
  options: SilenceMonitorOptions
): SilenceMonitor {
  const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextCtor) {
    return {
      stop: () => {},
      resetTimer: () => {},
    };
  }

  const audioContext = new AudioContextCtor();
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.8;

  const source = audioContext.createMediaStreamSource(stream);
  source.connect(analyser);

  const threshold = options.threshold ?? 0.02;
  const sampleIntervalMs = options.sampleIntervalMs ?? 500;
  const dataArray = new Uint8Array(analyser.fftSize);

  let lastSoundAt = Date.now();
  let silenceTriggered = false;

  const check = () => {
    analyser.getByteTimeDomainData(dataArray);
    let sumSquares = 0;
    for (let i = 0; i < dataArray.length; i += 1) {
      const normalized = (dataArray[i] - 128) / 128;
      sumSquares += normalized * normalized;
    }
    const rms = Math.sqrt(sumSquares / dataArray.length);

    if (rms >= threshold) {
      lastSoundAt = Date.now();
      if (silenceTriggered) {
        silenceTriggered = false;
        options.onSound?.();
      }
    }

    if (!silenceTriggered && Date.now() - lastSoundAt >= options.silenceMs) {
      silenceTriggered = true;
      options.onSilence();
    }
  };

  const interval = window.setInterval(check, sampleIntervalMs);

  const stop = () => {
    window.clearInterval(interval);
    try {
      source.disconnect();
    } catch {
      // no-op
    }
    try {
      analyser.disconnect();
    } catch {
      // no-op
    }
    try {
      audioContext.close();
    } catch {
      // no-op
    }
  };

  const resetTimer = () => {
    lastSoundAt = Date.now();
    silenceTriggered = false;
  };

  return { stop, resetTimer };
}
