/* Authored Fortællinger are data. This module turns that data into the story
   mode and markup; app.js keeps navigation, persistence and DOM ownership. */

export function mode(story, bankById, usable) {
  return {
    id: `story-${story.id}`,
    da: story.title,
    accent: '--astrid',
    story,
    build: () => story.questions
      .map((id) => bankById.get(id))
      .filter((question) => question && usable(question)),
  };
}

export function list(stories, best, chevron) {
  return stories.map((story, index) => {
    const score = best[`story-${story.id}`];
    return `<button class="story-card" type="button" data-story="${story.id}" aria-pressed="false" style="--d:${index * .08}s;--i:${index}">
      <span class="story-card-kicker">${story.eyebrow}</span>
      <b>${story.title}</b>
      <p>${story.intro}</p>
      <span class="story-card-meta">${story.sections.length} kapitler · ${story.questions.length} spørgsmål${Number.isFinite(score) ? ` · bedste ${score}/${story.questions.length}` : ''}</span>
      <span class="story-card-open"><span>Kald fortællingen frem</span>${chevron}</span>
    </button>`;
  }).join('');
}

export function deck(container, onOpen, onStatus) {
  let selected = null;
  let pointer = null;
  let suppressClick = false;

  const cards = () => [...container.querySelectorAll('.story-card')];
  const activate = (card, focus = false) => {
    if (!card) return;
    selected = card.dataset.story;
    for (const item of cards()) {
      const active = item === card;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-pressed', String(active));
      item.querySelector('.story-card-open span').textContent = active
        ? 'Træd ind i fortællingen'
        : 'Kald fortællingen frem';
    }
    card.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth' });
    if (focus) card.focus({ preventScroll: true });
    onStatus?.(`${card.querySelector('b').textContent} er valgt. Klik igen for at åbne.`);
  };
  const move = (direction) => {
    const items = cards();
    if (!items.length) return;
    const current = Math.max(0, items.findIndex((card) => card.dataset.story === selected));
    activate(items[Math.max(0, Math.min(items.length - 1, current + direction))], true);
  };

  container.addEventListener('click', (event) => {
    const card = event.target.closest('.story-card');
    if (!card || suppressClick) return;
    if (card.dataset.story === selected) onOpen(card.dataset.story);
    else activate(card);
  });
  container.addEventListener('keydown', (event) => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    move(event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 1);
  });
  container.addEventListener('pointerdown', (event) => {
    const card = event.target.closest('.story-card');
    if (!card || event.button !== 0) return;
    pointer = { card, x: event.clientX, y: event.clientY, dragging: false };
  });
  container.addEventListener('pointermove', (event) => {
    if (!pointer) return;
    const x = event.clientX - pointer.x;
    const y = event.clientY - pointer.y;
    if (!pointer.dragging) {
      // A vertical page scroll starts with the same pointerdown as a card swipe.
      if (Math.abs(y) > Math.abs(x)) {
        pointer = null;
        return;
      }
      if (Math.abs(x) < 8) return;
      pointer.dragging = true;
      pointer.card.classList.add('is-dragging');
    }
    pointer.card.style.setProperty('--drag', `${Math.max(-24, Math.min(24, x * .18))}px`);
  });
  const release = (event) => {
    if (!pointer) return;
    const { card, x, dragging } = pointer;
    pointer = null;
    card.classList.remove('is-dragging');
    card.style.removeProperty('--drag');
    if (!dragging) return;
    const distance = event.clientX - x;
    if (Math.abs(distance) < 45) return;
    suppressClick = true;
    activate(card);
    move(distance < 0 ? 1 : -1);
    setTimeout(() => { suppressClick = false; }, 0);
  };
  container.addEventListener('pointerup', release);
  container.addEventListener('pointercancel', () => {
    if (!pointer) return;
    pointer.card.classList.remove('is-dragging');
    pointer.card.style.removeProperty('--drag');
    pointer = null;
  });

  return {
    restore(storyId) {
      selected = null;
      if (storyId) activate(cards().find((card) => card.dataset.story === storyId));
    },
  };
}

export function content(story, materialSource, topicIcon) {
  const pages = [...new Set(story.sections.flatMap((section) => section.pages)
    .concat(story.moments.flatMap((moment) => moment.pages)))].sort((a, b) => a - b);
  const groups = new Map();
  for (const item of story.further ?? []) {
    const divider = item.label.indexOf(': ');
    const source = divider < 0 ? item.label : item.label.slice(0, divider);
    const label = divider < 0 ? item.label : item.label.slice(divider + 2);
    groups.set(source, [...(groups.get(source) ?? []), { ...item, label }]);
  }
  const further = groups.size ? `<div class="story-further">
    <h3>Læs videre</h3>
    <p>Frivillig baggrund fra museer og myndigheder. SIRI er fortsat kilden til spørgsmål, svar og forklaringer.</p>
    <ul>${[...groups].map(([source, links]) => `<li><b>${source}</b><span>${links.map((link) => `<a href="${link.url}" target="_blank" rel="noopener">${link.label}</a>`).join('')}</span></li>`).join('')}</ul>
  </div>` : '';

  return {
    connections: story.connections.map((connection) => `<span>${connection}</span>`).join(''),
    timeline: story.moments.map((moment) => `<div class="story-moment">
      <time>${moment.year}</time><p>${moment.text}</p>
      <small>${materialSource(moment.pages)}</small>
    </div>`).join(''),
    sections: story.sections.map((section, index) => `<section class="story-section">
      <span class="story-section-number">${String(index + 1).padStart(2, '0')}</span>
      <div><h3>${section.title}</h3>${section.body.map((paragraph) => `<p>${paragraph}</p>`).join('')}
        <p class="story-source">${materialSource(section.pages)}</p></div>
    </section>`).join(''),
    sources: `<h3>Kilder til fortællingen</h3><p>${materialSource(pages)}</p>${further}`,
    quiz: `${topicIcon('book')}Prøv det, du har lært · ${story.questions.length} spørgsmål`,
  };
}
