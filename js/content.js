const FILES = [
  'questions', 'explanations', 'currency', 'principles', 'eras', 'sagas',
  'stories', 'kinship', 'sources',
];

const lines = (text) => text.split('\n').filter(Boolean).map((line) => JSON.parse(line));

async function grab(name) {
  const extension = name === 'sources' ? 'json' : 'jsonl';
  const path = `./data/${name}.${extension}`;
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Mangler ${path}`);
  const text = await response.text();
  if (!text.trim()) throw new Error(`${path} er tom`);
  return text;
}

export async function loadContent() {
  const loaded = await Promise.all(FILES.map(grab));
  const data = Object.fromEntries(FILES.map((name, index) => [name, loaded[index]]));
  const sources = JSON.parse(data.sources);
  const principles = lines(data.principles);
  const eras = lines(data.eras);
  const sagas = lines(data.sagas);
  const stories = lines(data.stories);
  const kin = new Map();
  for (const group of lines(data.kinship)) {
    for (const id of group.questions ?? []) kin.set(id, group.questions);
  }

  const explanations = new Map(lines(data.explanations).map((entry) => [entry.id, entry]));
  const currency = new Map(lines(data.currency).map((entry) => [entry.id, entry]));
  const bank = lines(data.questions).map((question) => {
    const written = explanations.get(question.id);
    const merged = { ...question };
    if (written?.explain) merged.explain = written.explain;
    if (written?.dated) merged.dated = written.dated;
    if (written?.page) merged.page = written.page;
    else if (question.section === 'aktuelt') delete merged.page;
    const status = currency.get(question.id);
    return status ? { ...merged, status: status.status, currency: status.note } : merged;
  });
  const unexplained = bank.filter((question) => question.section !== 'vaerdier' && !question.explain);
  if (unexplained.length) throw new Error(`${unexplained.length} spørgsmål mangler en gennemgået forklaring`);

  const papers = new Set(bank.flatMap((question) => question.seen.map((seen) => seen.split('#')[0])));
  const values = bank.filter((question) => question.section === 'vaerdier');
  return {
    bank,
    bankById: new Map(bank.map((question) => [question.id, question])),
    sources,
    principles,
    eras,
    sagas,
    stories,
    kin,
    paperCount: papers.size,
    valuesAsked: values.reduce((count, question) => count + question.seen.length, 0),
    valuesUnique: values.length,
  };
}
