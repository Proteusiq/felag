const REVIEW_DAYS = [1, 3, 7, 14];

const dayStamp = (date = new Date()) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

const afterDays = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return dayStamp(date);
};

export function remember(review, question, right, usable) {
  if (question.section !== 'laeremateriale' || !usable(question)) return;
  const today = dayStamp();
  const previous = review[question.id];
  const sameDay = previous?.last === today;
  const step = right
    ? sameDay ? Math.max(previous?.step ?? 0, 0) : Math.min((previous?.step ?? -1) + 1, REVIEW_DAYS.length - 1)
    : 0;
  review[question.id] = {
    step,
    due: afterDays(right ? REVIEW_DAYS[step] : 1),
    last: today,
    correct: Boolean(right),
    lapses: (previous?.lapses ?? 0) + (right ? 0 : 1),
  };
}

export function due(review, bankById, usable) {
  const today = dayStamp();
  return Object.entries(review)
    .filter(([, entry]) => entry.due <= today)
    .map(([id]) => bankById.get(id))
    .filter((question) => question && usable(question) && question.section === 'laeremateriale');
}

function interleave(questions, rand, shuffle) {
  const groups = new Map();
  for (const question of shuffle(questions, rand)) {
    const group = groups.get(question.chapter) ?? [];
    group.push(question);
    groups.set(question.chapter, group);
  }
  const mixed = [];
  while ([...groups.values()].some((group) => group.length)) {
    for (const group of groups.values()) if (group.length) mixed.push(group.shift());
  }
  return mixed;
}

export function mode(review, bankById, usable, shuffle) {
  return {
    id: 'review',
    da: 'Dagens genbesøg',
    accent: '--green',
    review: true,
    build: (rand) => interleave(due(review, bankById, usable), rand, shuffle).slice(0, 15),
  };
}
