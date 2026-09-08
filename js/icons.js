export const ICON = {
  shut: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><rect x="3" y="7" width="10" height="7" rx="1.6"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/></svg>`,
  open: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><rect x="3" y="7" width="10" height="7" rx="1.6"/><path d="M5.5 7V5a2.5 2.5 0 0 1 4.9-.6"/></svg>`,
  done: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3.2 8.4 6.4 11.6 12.8 4.8"/></svg>`,
  chevron: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6.5 8 10.5 12 6.5"/></svg>`,
  book: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3c2-.8 4-.5 6 1v9c-2-1.5-4-1.8-6-1V3Zm12 0c-2-.8-4-.5-6 1v9c2-1.5 4-1.8 6-1V3Z"/></svg>`,
};

export const RUNESTONE_ICON = `<svg viewBox="0 0 36 42" fill="none">
  <path d="M8 38h20l-2-27c-.5-5.5-4.3-8-8-8s-7.5 2.5-8 8L8 38Z"/>
  <path d="M13 32V14l5-4 5 4v18M13 19h10M18 10v22M15 26h6"/>
  <path d="m10 35 4 3m12-3-4 3"/>
</svg>`;

const TOPIC = {
  viking: ['Vikingetid', `<path d="M3 15c3 2 6 3 9 3s6-1 9-3l-2 4H5l-2-4Z"/><path d="M12 3v10m0-8c3 0 5 2 5 4-3 0-5-1-5-4ZM5 12V9"/>`],
  medieval: ['Middelalder', `<path d="M5 20V8h3V4h3v4h2V4h3v4h3v12H5Z"/><path d="M9 20v-5h6v5M8 11h2m4 0h2"/>`],
  crown: ['Konge og enevælde', `<path d="m4 8 4 4 4-7 4 7 4-4-2 11H6L4 8Z"/><path d="M7 16h10"/>`],
  war: ['Krig og grænser', `<path d="m6 19 12-14m-12 0 12 14M4 4l4 1-3 3-1-4Zm16 0-4 1 3 3 1-4Z"/>`],
  industry: ['Industri og bevægelser', `<path d="M4 20V10l5 3V8l5 3V5h4v15H4Z"/><path d="M7 17h2m3 0h2m2 0h2"/>`],
  modern: ['Det moderne Danmark', `<path d="M12 3v18M4 12h16M7 7l10 10m0-10L7 17"/>`],
  democracy: ['Styreformen', `<path d="M4 20h16M6 17h12M7 9h10v8H7V9Zm-2 0 7-5 7 5"/>`],
  constitution: ['Grundloven', `<path d="M6 3h10l3 3v15H6V3Z"/><path d="M16 3v4h4M9 11h7m-7 4h7"/>`],
  parliament: ['Folketinget', `<path d="M3 20h18M5 17h14M7 17V9h10v8M6 9l6-5 6 5"/>`],
  justice: ['Retssamfundet', `<path d="M12 3v18M7 6h10M6 8l-3 6h6L6 8Zm12 0-3 6h6l-3-6ZM8 21h8"/>`],
  welfare: ['Velfærd', `<path d="M12 20S4 15 4 9a4 4 0 0 1 7-2l1 1 1-1a4 4 0 0 1 7 2c0 6-8 11-8 11Z"/>`],
  business: ['Erhvervsliv', `<path d="M4 20V8h16v12H4Zm4-12V5h8v3M4 13h16M10 13v2h4v-2"/>`],
  labour: ['Arbejdsmarked', `<path d="M4 14h16v7H4v-7Zm3 0V9h10v5M9 9V5h6v4"/>`],
  europe: ['Danmark i Europa', `<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18m0-18c-3 3-3 15 0 18"/>`],
  globe: ['Globalt samarbejde', `<circle cx="12" cy="12" r="9"/><path d="m7 7 3 1 1 3 4 1 2 4-3 3-5-2-2-4-3-2"/>`],
  defence: ['Forsvar og sikkerhed', `<path d="M12 3 5 6v6c0 5 3 8 7 10 4-2 7-5 7-10V6l-7-3Z"/><path d="M12 7v10M8 12h8"/>`],
  book: ['Litteratur', `<path d="M4 5c3-1 6 0 8 2v14c-2-2-5-3-8-2V5Zm16 0c-3-1-6 0-8 2v14c2-2 5-3 8-2V5Z"/>`],
  art: ['Billedkunst', `<path d="M12 3a9 9 0 1 0 0 18h2a2 2 0 0 0 0-4h-1a2 2 0 0 1 0-4h4a4 4 0 0 0 4-4c0-4-4-6-9-6Z"/><circle cx="8" cy="9" r="1"/><circle cx="12" cy="7" r="1"/>`],
  music: ['Musik', `<path d="M9 18V7l10-2v11M9 18a3 3 0 1 1-3-3h3m10 1a3 3 0 1 1-3-3h3"/>`],
  architecture: ['Arkitektur', `<path d="M4 21h16M6 18h12M7 18V9h10v9M5 9l7-6 7 6M10 18v-5h4v5"/>`],
  stage: ['Scenekunst', `<path d="M4 4c5 0 8 2 8 7 0 5-3 8-8 9V4Zm16 0c-5 0-8 2-8 7 0 5 3 8 8 9V4Z"/><path d="M7 9h2m6 0h2M7 14c1 1 2 1 3 0m4 0c1 1 2 1 3 0"/>`],
  film: ['Film', `<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M7 6l3 4m2-4 3 4m2-4 3 4"/>`],
  land: ['Land og steder', `<path d="M4 20 8 9l4 4 4-8 4 15H4Z"/><path d="M3 20h18"/>`],
  flag: ['Flaget', `<path d="M6 22V3m1 2h12l-2 4 2 4H7V5Z"/><path d="M11 5v8M7 8h12"/>`],
  realm: ['Rigsfællesskabet', `<circle cx="8" cy="10" r="4"/><circle cx="16" cy="10" r="4"/><circle cx="12" cy="16" r="4"/>`],
  grundtvig: ['Grundtvig og skole', `<path d="M5 19V6h11l3 3v10H5Z"/><path d="M16 6v4h4M8 13h8m-8 3h6"/><path d="m4 4 2-2 2 2"/>`],
  equality: ['Ligestilling og familie', `<circle cx="8" cy="8" r="4"/><circle cx="16" cy="8" r="4"/><path d="M8 12v9m-4-4h8m4-5v9m-4-4h8"/>`],
  health: ['Sundhed', `<path d="M12 21S4 16 4 10a4 4 0 0 1 7-2l1 1 1-1a4 4 0 0 1 7 2c0 6-8 11-8 11Z"/><path d="M8 13h2l1-3 2 6 1-3h2"/>`],
  climate: ['Klima', `<path d="M19 5C11 5 6 9 6 15c0 3 2 6 6 6 6 0 9-7 7-16Z"/><path d="M5 21c2-6 6-9 12-12"/>`],
};

export function topicIcon(key, className = '') {
  const topic = TOPIC[key] ?? TOPIC.modern;
  return `<svg class="topic-icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${topic[1]}</svg>`;
}

export const topicLabel = (key) => (TOPIC[key] ?? TOPIC.modern)[0];

export function topicKey(question) {
  const page = question.page ?? 0;
  if (question.section === 'vaerdier') return 'justice';
  if (question.section === 'aktuelt') return 'modern';
  if (question.chapter === 1) {
    if (page <= 9) return 'viking';
    if (page <= 12) return 'medieval';
    if (page <= 18) return 'crown';
    if (page <= 26) return 'war';
    if (page <= 37) return 'industry';
    return 'modern';
  }
  if (question.chapter === 2) return page < 96 ? 'democracy' : 'justice';
  if (question.chapter === 3) return page < 114 ? 'welfare' : page < 117 ? 'business' : 'labour';
  if (question.chapter === 4) return page < 131 ? 'europe' : page < 136 ? 'globe' : 'defence';
  if (question.chapter === 5) return page < 153 ? 'book' : page < 158 ? 'art' : page < 161 ? 'music' : page < 164 ? 'architecture' : page < 168 ? 'stage' : 'film';
  if (page < 190) return 'land';
  if (page < 191) return 'flag';
  if (page < 193) return 'crown';
  if (page < 208) return 'realm';
  if (page < 229) return 'grundtvig';
  if (page < 238) return 'equality';
  if (page < 242) return 'health';
  return 'climate';
}
