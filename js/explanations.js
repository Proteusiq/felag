const WARN = `<svg viewBox="0 0 24 24" fill="none"><path d="M12 3.5 22 20H2L12 3.5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 10v4M12 17h.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
const CHAPTERS = {
  1: 'Danmarks historie', 2: 'Det danske demokrati', 3: 'Den danske økonomi',
  4: 'Danmark og omverdenen', 5: 'Dansk kulturliv', 6: 'Temaopslag',
};
const MATERIAL_URL = 'laeremateriale-til-indfoedsretsproeven';

export function createExplanations(state, { topicIcon, topicKey, topicLabel }) {
  const sitting = (tag) => {
    const [year, month] = tag.split('#')[0].split('-');
    return `${Number(month) > 8 ? 'vinter' : 'sommer'} ${year}`;
  };

  const paperLink = (tag) => {
    const [stamp, number] = tag.split('#');
    const url = state.sources?.[`indfoedsretsproeven-${stamp}`];
    const key = state.sources?.[`indfoedsretsproeven-${stamp}-retteark`];
    const label = sitting(tag);
    const paper = url
      ? `<a href="${url}" target="_blank" rel="noopener">${label}, spørgsmål ${number}</a>`
      : `${label}, spørgsmål ${number}`;
    return key ? `${paper} (<a href="${key}" target="_blank" rel="noopener">retteark</a>)` : paper;
  };

  const materialLink = (page) => {
    const url = state.sources?.[MATERIAL_URL];
    const label = `Læremateriale til Indfødsretsprøven, side ${page}`;
    return url ? `<a href="${url}#page=${page}" target="_blank" rel="noopener">${label}</a>` : label;
  };

  const materialSource = (pages) => {
    const url = state.sources?.[MATERIAL_URL];
    const unique = [...new Set(pages)].sort((a, b) => a - b);
    const source = url
      ? `<a class="source-title" href="${url}" target="_blank" rel="noopener">Lærematerialet</a>`
      : '<span class="source-title">Lærematerialet</span>';
    const linked = unique.map((page) => url
      ? `<a href="${url}#page=${page}" target="_blank" rel="noopener" aria-label="Lærematerialet, side ${page}">${page}</a>`
      : page).join(', ');
    return `<span class="source-group">${source}<span>${unique.length === 1 ? 'side' : 'sider'} ${linked}</span></span>`;
  };

  const dating = (question) => {
    const last = question.seen.map((seen) => seen.split('#')[0]).sort().at(-1);
    if (question.currency || question.dated) {
      return `<div class="caution">${WARN}<span>${question.currency ?? question.dated}</span></div>`;
    }
    if (question.section === 'aktuelt') {
      return `<div class="caution">${WARN}<span>
        Aktuelt spørgsmål fra <b>${sitting(last)}</b>. Svaret var rigtigt dengang,
        og er ikke nødvendigvis rigtigt i dag. På din prøve handler de fem aktuelle
        spørgsmål om halvåret op til prøven. Følg med i danske nyheder.
      </span></div>`;
    }
    return '';
  };

  const buildWhy = (question, right) => {
    const topic = topicKey(question);
    const pages = question.pages ?? (question.page ? [question.page] : []);
    const where = question.chapter
      ? `Kapitel ${question.chapter}, ${CHAPTERS[question.chapter]}${pages.length ? `, ${pages.length === 1 ? 'side' : 'sider'} ${pages.join(', ')}` : ''}.`
      : '';
    const principle = question.section === 'vaerdier'
      ? state.principles.find((item) => item.questions.includes(question.id))
      : null;
    const body = question.explain
      ? `<p>${question.explain}</p>`
      : principle
      ? `<p><b>${principle.title}.</b> ${principle.rule}</p><p>${principle.detail}</p>`
      : `<p class="thin">Forklaringen bliver skrevet fra lærematerialet${question.page ? `, side ${question.page}` : ''}.</p>`;

    const why = document.createElement('div');
    why.className = 'why';
    why.innerHTML = `
      <p class="answer-result ${right ? 'right' : 'wrong'}">${right ? 'Rigtigt' : `Forkert · Det rigtige svar er ${question.answer}`}</p>
      <p class="lbl">${topicIcon(topic)}Forklaring · ${topicLabel(topic)}</p>
      ${body}${dating(question)}
      <span class="src">
        ${question.seen.length > 1
          ? `Stillet <b>${question.seen.length} gange</b> siden 2020: ${question.seen.map(paperLink).join(', ')}.`
          : `Stillet <b>${paperLink(question.seen[0])}</b>.`}
        ${pages.length ? `Slå efter i ${pages.length === 1 ? materialLink(pages[0]) : materialSource(pages)}.` : where}
        Åbn den officielle prøve for at se spørgsmålet med de oprindelige svarmuligheder.
      </span>`;
    return why;
  };

  const examReview = (run) => {
    const missed = run.questions.flatMap((question, index) => {
      if (run.marks[index] === true) return [];
      const explanation = buildWhy(question, false);
      const result = explanation.querySelector('.answer-result');
      const choice = run.choices[index];
      if (choice === null) result.textContent = `Ubesvaret · Det rigtige svar er ${question.answer}`;
      else result.insertAdjacentHTML('afterend', `<p class="exam-choice">Dit svar: <b>${question.options[choice]}</b></p>`);
      return [`<details class="exam-review-item">
        <summary><span>${index + 1}. ${question.q}</span><b>${choice === null ? 'Ubesvaret' : 'Forkert'}</b></summary>
        ${explanation.outerHTML}
      </details>`];
    });
    if (!missed.length) return '<p class="exam-perfect">Ingen fejl at gennemgå.</p>';
    return `<section class="exam-review" aria-labelledby="examReviewTitle">
      <h3 id="examReviewTitle">Gennemgå dine ${missed.length} fejl</h3>
      <p>Forklaringerne og de officielle kilder vises nu, hvor prøven er afleveret.</p>
      ${missed.join('')}
    </section>`;
  };

  return { sitting, materialLink, materialSource, buildWhy, examReview };
}
