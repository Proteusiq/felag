const PLACES = [
  { from: 20, kind: 'by', da: 'By', glyph: `<path d="M3 21h18M5 21V9l4-3 4 3v12M13 21v-9l3-2 3 2v9"/><path d="M7 12h2m-2 3h2m8-1h2m-2 3h2"/>` },
  { from: 12, kind: 'kobstad', da: 'Købstad', glyph: `<path d="M3 21h18M5 21v-8l4-3 4 3v8"/><path d="M15 21v-9l3-2 3 2v9M18 7V4m-1.5 1.5h3"/>` },
  { from: 6, kind: 'landsby', da: 'Landsby', glyph: `<path d="M3 21h18M6 21v-6l3-2 3 2v6M14 21v-4l3-2 3 2v4"/>` },
  { from: 1, kind: 'gaard', da: 'Gård', glyph: `<path d="M3 21h18M5 21v-7l7-4 7 4v7"/><path d="M10 21v-5h4v5"/>` },
  { from: 0, kind: 'oede', da: 'Ødegård', glyph: `<path d="M3 21h18"/><path d="M6 21v-6l3-2 1 .6M18 21v-5l-2-1.4" stroke-dasharray="2.6 2.2"/><path d="M13 21v-2.5"/>` },
];

export function createReading({ state, $, usable, halls, icon, materialLink, materialSource, go, retryHall }) {
  let returnTo = () => {};
  let current = null;

  const sagasIn = (chapter) => (state.sagas ?? []).filter((saga) => saga.chapter === chapter);
  const placeOf = (count) => PLACES.find((place) => count >= place.from);
  const inSentence = (name) => name.startsWith('Danmark') ? name : name[0].toLowerCase() + name.slice(1);

  function oneEach(questions, local = false) {
    const available = new Map(questions.map((question) => [question.id, question]));
    const taken = new Set();
    const readings = [];
    for (const question of questions) {
      const group = state.kin?.get(question.id);
      if (!group) { readings.push(question); continue; }
      if (taken.has(group)) continue;
      taken.add(group);
      const kin = group.map((id) => state.bankById.get(id)).filter((item) => item && usable(item));
      if (!kin.length) continue;
      const candidates = local ? kin.filter((item) => available.has(item.id)) : kin;
      const lead = candidates.reduce((best, item) =>
        (item.explain?.length ?? 0) > (best.explain?.length ?? 0) ? item : best, candidates[0]);
      if (!local && !available.has(lead.id)) continue;
      readings.push({ ...lead, seen: [...new Set(kin.flatMap((item) => item.seen))].sort() });
    }
    return readings;
  }

  function counts(chapter) {
    const stretches = sagasIn(chapter).map((saga) =>
      oneEach(saga.questions.map((id) => state.bankById.get(id)).filter((question) => question && usable(question))));
    return {
      places: stretches.length,
      readings: stretches.reduce((total, items) => total + items.length, 0),
      pages: sagasIn(chapter).reduce((total, saga) => total + saga.until - saga.page + 1, 0),
    };
  }

  const wasMissed = (question, missed) => missed.has(question.id)
    || (state.kin?.get(question.id) ?? []).some((id) => missed.has(id));

  function told(question, missed) {
    const lead = question.answer.replace(/\.$/, '');
    let explanation = question.explain ?? '';
    if (explanation.toLowerCase().startsWith(lead.toLowerCase()) && explanation[lead.length] === '.') {
      explanation = explanation.slice(lead.length + 1).trim() || explanation;
    }
    return `<article class="told ${missed ? 'missed' : ''}">
      <p class="told-a">${question.answer}${missed ? '<em>du missede den</em>' : ''}</p>
      ${explanation ? `<p class="told-why">${explanation}</p>` : ''}
      <p class="told-src">Spurgt: &ldquo;${question.q}&rdquo;
        &middot; ${question.pages?.length > 1 ? materialSource(question.pages) : question.page ? materialLink(question.page) : ''}
        &middot; ${question.seen.length === 1 ? 'stillet én gang' : `stillet ${question.seen.length} gange`}</p>
    </article>`;
  }

  function showIndex() {
    returnTo = showIndex;
    $('hudTitle').textContent = 'Sagaerne';
    $('hudBackLabel').textContent = 'Tilbage til vejen';
    $('hudBack').setAttribute('aria-label', 'Tilbage til vejen');
    $('hudBack').dataset.tooltip = 'Tilbage til vejen';
    $('sagaHalls').innerHTML = halls.map((hall, index) => {
      const summary = counts(hall.chapter);
      return `<div class="hall" style="--accent:var(${hall.accent}); --d:${index * .06}s">
        <span class="thread"></span><span class="node">${hall.numeral}</span>
        <span class="hall-main"><button class="body" type="button" data-read="${index}">
          <span class="names"><span class="da">${hall.da}</span><span class="en">${hall.en}</span><span class="state">${icon.book}Læs</span></span>
          <span class="hall-progress"><span>Bebyggelser <b>${summary.places}</b></span><span>Læsninger <b>${summary.readings}</b></span><span>Sider <b>${summary.pages}</b></span></span>
        </button></span>
      </div>`;
    }).join('');
    go('viewSagaer', 'path');
  }

  function showHall(hall, missed = null, back = returnTo) {
    current = hall;
    returnTo = back;
    const places = sagasIn(hall.chapter);
    const shown = places.map((saga) => {
      const questions = oneEach(
        saga.questions.map((id) => state.bankById.get(id)).filter((question) => question && usable(question)),
        Boolean(missed));
      const hit = missed ? questions.filter((question) => wasMissed(question, missed)) : questions;
      return { saga, questions, hit };
    }).filter((row) => !missed || row.hit.length);

    $('hudTitle').textContent = `Sagaen · ${hall.da}`;
    $('hudBackLabel').textContent = 'Tilbage til De Seks Haller';
    $('hudBack').setAttribute('aria-label', 'Tilbage til De Seks Haller');
    $('hudBack').dataset.tooltip = 'Tilbage til De Seks Haller';
    $('sagasTitle').textContent = `Sagaen om ${inSentence(hall.da)}`;
    const total = shown.reduce((count, row) => count + row.hit.length, 0);
    $('sagasSub').innerHTML = missed
      ? `Dine fejl samles i <b>${total}</b> ${total === 1 ? 'forklaring' : 'forklaringer'} fra ${shown.length} ${shown.length === 1 ? 'bebyggelse' : 'bebyggelser'}. Læs dem her, og tag hallen igen når du er klar.`
      : `Kapitlet ligger som ${places.length} bebyggelser langs vejen. Jo større stedet, jo mere er der spurgt om de sider. Alt er åbent fra første dag &mdash; det her er læsestof, ikke en prøve.`;

    $('places').innerHTML = shown.map(({ saga, questions, hit }, index) => {
      const place = placeOf(questions.length);
      const group = missed ? '' : `name="saga-${hall.chapter}"`;
      return `<div class="place ${place.kind}" style="--accent:var(${hall.accent}); --d:${index * .05}s">
        <span class="thread"></span>
        <span class="node" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${place.glyph}</svg></span>
        <details class="body" ${group} ${missed || shown.length === 1 ? 'open' : ''}>
          <summary><span class="names"><span class="da">${saga.title}</span><span class="state">${place.da}${icon.chevron}</span></span>
            <span class="place-meta"><span>${questions.length ? `${questions.length} ${questions.length === 1 ? 'læsning' : 'læsninger'}` : 'aldrig spurgt om'}</span><span>side ${saga.page}${saga.until > saga.page ? `–${saga.until}` : ''}</span>${missed ? `<span class="lost">${hit.length} du missede</span>` : ''}</span>
            ${saga.covers.length ? `<span class="covers">Rummer også ${saga.covers.join(' &middot; ')}</span>` : ''}</summary>
          ${hit.length ? hit.map((question) => told(question, missed ? wasMissed(question, missed) : false)).join('') : `<p class="told-none">Ingen af prøvens spørgsmål er hentet herfra i de ${state.paperCount} prøver siden 2020. Siderne er værd at kende, men de er ikke det, du falder på.</p>`}
        </details>
      </div>`;
    }).join('');

    $('sagaRetry').hidden = !missed;
    if (missed) $('sagaRetry').onclick = () => retryHall(hall);
    go('viewSagas', 'hall');
  }

  return {
    counts,
    sentenceName: inSentence,
    showIndex,
    showHall,
    currentHall: () => current,
    back: () => returnTo(),
  };
}
