/* Tiny synthesised cues keep the site free of audio assets. */
export function createSound(isEnabled) {
  let audio = null;

  const tone = (frequency, duration = .12, type = 'sine', gain = .05) => {
    if (!isEnabled()) return;
    audio ??= new (window.AudioContext ?? window.webkitAudioContext)();
    const oscillator = audio.createOscillator();
    const amplifier = audio.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    amplifier.gain.setValueAtTime(gain, audio.currentTime);
    amplifier.gain.exponentialRampToValueAtTime(.0001, audio.currentTime + duration);
    oscillator.connect(amplifier).connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + duration);
  };

  return {
    select: () => tone(520, .09),
    toggle: () => tone(600, .1),
    hit: () => { tone(660, .1); setTimeout(() => tone(990, .16), 70); },
    miss: () => tone(150, .22, 'triangle', .04),
    done: () => [523, 659, 784].forEach((frequency, index) => setTimeout(() => tone(frequency, .3), index * 110)),
    sink: () => [220, 174, 130].forEach((frequency, index) => setTimeout(() => tone(frequency, .3, 'triangle', .06), index * 140)),
  };
}
