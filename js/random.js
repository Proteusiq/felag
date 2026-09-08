/* Seeded option order stops learners memorising answer positions and lets two
   devices rebuild the same challenge without a server. */
export function rng(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(value ^ (value >>> 15), 1 | value);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

export const hash = (text) => [...text]
  .reduce((value, character) => Math.imul(value ^ character.charCodeAt(0), 16777619), 2166136261);

export function shuffle(list, random) {
  const shuffled = [...list];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const target = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
}

export function present(entry, seed) {
  const yesNo = entry.options.length === 2 && entry.options.every((option) => /^(Ja|Nej)$/.test(option));
  const options = yesNo ? entry.options : shuffle(entry.options, rng(hash(entry.id + seed)));
  return { ...entry, options, answerAt: options.indexOf(entry.answer) };
}
