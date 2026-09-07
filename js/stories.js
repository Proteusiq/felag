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
    return `<button class="story-card" type="button" data-story="${story.id}" style="--d:${index * .08}s;--i:${index}">
      <span class="story-card-kicker">${story.eyebrow}</span>
      <b>${story.title}</b>
      <p>${story.intro}</p>
      <span class="story-card-meta">${story.sections.length} kapitler · ${story.questions.length} spørgsmål${Number.isFinite(score) ? ` · bedste ${score}/${story.questions.length}` : ''}</span>
      <span class="story-card-open">Læs fortællingen ${chevron}</span>
    </button>`;
  }).join('');
}

export function content(story, materialSource, topicIcon) {
  const pages = [...new Set(story.sections.flatMap((section) => section.pages)
    .concat(story.moments.flatMap((moment) => moment.pages)))].sort((a, b) => a - b);

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
    sources: `<h3>Kilder til fortællingen</h3><p>${materialSource(pages)}</p>`,
    quiz: `${topicIcon('book')}Prøv det, du har lært · ${story.questions.length} spørgsmål`,
  };
}
