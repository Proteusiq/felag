export const HALL_PASS = .8;

export const HALLS = [
  { numeral: 'I', chapter: 1, accent: '--thor', da: 'Danmarks historie', en: "Denmark's history", topics: ['viking', 'medieval', 'crown', 'war', 'industry', 'modern'] },
  { numeral: 'II', chapter: 2, accent: '--gorm', da: 'Det danske demokrati', en: 'Danish democracy', topics: ['democracy', 'constitution', 'parliament', 'justice'] },
  { numeral: 'III', chapter: 3, accent: '--ingrid', da: 'Den danske økonomi', en: 'The Danish economy', topics: ['welfare', 'business', 'labour'] },
  { numeral: 'IV', chapter: 4, accent: '--freja', da: 'Danmark og omverdenen', en: 'Denmark and the world', topics: ['europe', 'globe', 'defence'] },
  { numeral: 'V', chapter: 5, accent: '--astrid', da: 'Dansk kulturliv', en: 'Danish cultural life', topics: ['book', 'art', 'music', 'architecture', 'stage', 'film'] },
  { numeral: 'VI', chapter: 6, accent: '--bjorn', da: 'Temaopslag', en: 'Thematic entries', topics: ['land', 'flag', 'crown', 'realm', 'grundtvig', 'equality', 'health', 'climate'] },
];

export function createHalls({ state, $, usable, weighted, topicIcon, topicLabel, icon, reading, go }) {
  let mastery = null;
  const inChapter = (chapter) => state.bank
    .filter((question) => question.section === 'laeremateriale' && question.chapter === chapter && usable(question));
  const stateAt = (index, cleared = state.cleared ?? 0) =>
    index < cleared ? 'done' : index === cleared ? 'open' : 'shut';

  const progress = (hall) => {
    const stock = inChapter(hall.chapter);
    const ids = new Set(stock.map((question) => question.id));
    const saved = state.hallStats?.[hall.chapter] ?? {};
    const seen = new Set((saved.seen ?? []).filter((id) => ids.has(id))).size;
    const correct = new Set((saved.correct ?? []).filter((id) => ids.has(id))).size;
    return { total: stock.length, seen, correct, left: stock.length - seen };
  };

  const mode = (hall, index) => {
    const stock = inChapter(hall.chapter);
    return {
      id: `hal-${hall.chapter}`,
      da: `Hal ${hall.numeral}. ${hall.da}`,
      accent: hall.accent,
      hall,
      index,
      build: (random) => weighted(stock, Math.min(12, stock.length), random),
    };
  };

  const render = () => {
    const cleared = state.cleared ?? 0;
    $('halls').innerHTML = HALLS.map((hall, index) => {
      const gate = stateAt(index, cleared);
      const shut = gate === 'shut';
      const done = gate === 'done';
      const saved = progress(hall);
      const mark = icon[done ? 'done' : shut ? 'shut' : 'open'];
      const label = done ? 'Port åbnet' : shut ? 'Låst' : 'Åben';
      const { places } = reading.counts(hall.chapter);
      return `<div class="hall ${done ? 'done' : ''} ${shut ? 'shut' : ''}" style="--accent:var(${hall.accent}); --d:${index * .06}s">
        <span class="thread"></span><span class="node">${done ? icon.done : hall.numeral}</span>
        <span class="hall-main"><button class="body" type="button" data-i="${index}" ${shut ? 'disabled' : ''}>
          <span class="names"><span class="da">${hall.da}</span><span class="en">${hall.en}</span><span class="state">${mark}${label}</span></span>
          <span class="chips">${hall.topics.map((key) => `<span>${topicIcon(key)}${topicLabel(key)}</span>`).join('')}<span>${saved.total} i banken</span><span>12 spørgsmål · 10 rigtige for at åbne</span></span>
          <span class="hall-progress"><span>Set <b>${saved.seen}</b></span><span>Rigtige <b>${saved.correct}</b></span><span>Tilbage <b>${saved.left}</b></span></span>
        </button>
        <!-- Reading is always open; only sitting the hall is gated. -->
        <button class="hall-read" type="button" data-read="${index}"><span class="read-mark" aria-hidden="true">${icon.book}</span><span class="read-copy"><b>Læs sagaen om ${reading.sentenceName(hall.da)}</b><small>${places} ${places === 1 ? 'bebyggelse' : 'bebyggelser'} · altid åben</small></span><svg class="read-go" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m10 5 7 7-7 7m6-7H6"/></svg></button>
        </span>
      </div>`;
    }).join('');
  };

  const renderPath = () => {
    const cleared = Math.min(state.cleared ?? 0, HALLS.length);
    const next = HALLS[cleared];
    $('learningPath').innerHTML = `
      <span class="learning-sigil" aria-hidden="true"><svg viewBox="0 0 64 56" fill="none"><path d="M7 45c10-18 18-27 27-27 8 0 12 8 23 8"/><path d="m49 17 8 9-10 6"/><circle cx="8" cy="45" r="4"/><circle cx="20" cy="31" r="3"/><circle cx="33" cy="18" r="3"/><circle cx="46" cy="25" r="3"/></svg></span>
      <span class="learning-copy"><span class="learning-kicker">Læringsstien</span><b>De Seks Haller</b><small>${cleared === HALLS.length ? 'Alle seks porte er åbnet.' : `Næste hal: ${next.da}`}</small><span class="learning-meter" aria-label="${cleared} af ${HALLS.length} porte åbnet">${HALLS.map((_, index) => `<i class="${stateAt(index, cleared)}"></i>`).join('')}<em>${cleared} / ${HALLS.length} porte åbnet</em></span></span>
      <span class="learning-open">Åbn stien<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m10 5 7 7-7 7m6-7H6"/></svg></span>`;
  };

  const renderWelcome = (runestone) => {
    const { profile } = state;
    const cleared = profile ? state.cleared ?? 0 : 0;
    const completed = cleared === HALLS.length;
    const current = Math.min(cleared, HALLS.length - 1);
    document.querySelectorAll('[data-welcome-hall]').forEach((button) => {
      const index = Number(button.dataset.welcomeHall);
      const hall = HALLS[index];
      const status = index < cleared ? 'ryddet' : index === cleared ? 'åben' : 'låst';
      button.classList.toggle('done', index < cleared);
      button.classList.toggle('active', index === current);
      button.disabled = index > cleared;
      button.setAttribute('aria-label', `Hal ${hall.numeral}: ${hall.da}, ${status}. 12 spørgsmål; 10 rigtige kræves.`);
    });
    $('welcomeIdentity').textContent = profile ? `Fortsæt som ${profile.name}` : 'Begynd her';
    $('welcomeHallName').textContent = completed ? 'Altinget venter' : HALLS[current].da;
    $('welcomeStartLabel').textContent = profile ? 'Sæt sejl' : 'Begynd rejsen';
    $('welcomeStartMeta').textContent = profile ? 'Til Vejen frem' : 'Vælg din vejleder';
    const unseen = completed
      ? HALLS.map((hall, index) => ({ hall, index, left: progress(hall).left })).filter((item) => item.left > 0)
      : [];
    const randomIndex = Math.floor(Math.random() * HALLS.length);
    mastery = unseen.length ? unseen[Math.floor(Math.random() * unseen.length)]
      : completed ? { hall: HALLS[randomIndex], index: randomIndex, left: 0 } : null;
    $('welcomeExamLabel').textContent = completed ? 'Mestr din rejse' : 'Tag Altinget';
    $('welcomeExamMeta').textContent = completed
      ? mastery.left ? `${mastery.left} usete spørgsmål · ${mastery.hall.da}` : 'Alle spørgsmål set · tilfældig hal'
      : '45 min simulation';
    $('welcomeExamIcon').innerHTML = completed ? runestone : topicIcon('parliament');
    $('welcomeExam').setAttribute('aria-label', completed
      ? mastery.left ? `Mestr din rejse: ${mastery.left} usete spørgsmål i ${mastery.hall.da}` : 'Mestr din rejse med 12 spørgsmål fra en tilfældig hal'
      : 'Tag Altinget, en 45 minutters simulation');
    $('welcomeNavStart').textContent = profile ? 'Fortsæt' : 'Start træning';
    $('welcomeSwitch').hidden = !profile;
  };

  const show = () => {
    $('hudTitle').textContent = 'De Seks Haller';
    $('hudBackLabel').textContent = 'Tilbage til vejen';
    $('hudBack').setAttribute('aria-label', 'Tilbage til vejen');
    $('hudBack').dataset.tooltip = 'Tilbage til vejen';
    render();
    go('viewHalls', 'path');
  };

  return { stateAt, mode, renderPath, renderWelcome, show, masteryHall: () => mastery?.index ?? null };
}
