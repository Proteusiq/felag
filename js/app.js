/* ============================================================
   Félag · app shell.

   This module composes the views and learning flows. Focused modules own
   content loading, profiles, review scheduling, navigation, icons and stories.
   ============================================================ */

import { CAST, byId } from './cast.js';
import * as scenes from './scenes.js';
import * as saga from './map.js';
import * as storyView from './stories.js';
import { createNavigation } from './navigation.js';
import * as reviewStore from './review.js';
import * as profiles from './profiles.js';
import { ICON, RUNESTONE_ICON, topicIcon, topicKey, topicLabel } from './icons.js';
import { hash, present, rng, shuffle } from './random.js';
import { createSound } from './sound.js';
import { loadContent } from './content.js';
import { createReading } from './reading.js';
import { createExplanations } from './explanations.js';
import { HALLS, HALL_PASS, createHalls } from './halls.js';

const $ = (id) => document.getElementById(id);

/* ============================================================
   Where progress lives

   On the device and nowhere else. There is no server, no account
   and nothing transmitted, so the only real risk is a shared
   machine: a family laptop, a library or a jobcenter computer,
   where one browser profile would otherwise mean one shared
   record that the next person inherits and overwrites.

   So progress is namespaced per person on that device. A guest
   writes to sessionStorage instead, which the browser discards
   when the tab closes and leaves nothing behind on a public
   computer.

   localStorage is the right store at this size. The record remains small,
   and IndexedDB would be machinery for nothing.
   ============================================================ */
const LEGACY = 'felag.v1';
const { ACTIVE_PROFILE, ACTIVE_GUEST, keyFor, slugify, people, remember, activePerson } = profiles;
const store = () => profiles.storage(state.profile);

/* ---------- exam rules, straight from SIRI ----------
   45 questions: 35 from the læremateriale, 5 current affairs,
   5 on Danish values. Pass needs 36 correct AND at least 4 of
   the 5 values questions. The values gate fails people who
   otherwise scored well, so it is modelled explicitly. */
const RULES = { total: 45, pass: 36, values: 5, valuesPass: 4, minutes: 45 };

/**
 * The next sitting, as SIRI publishes it. Two sittings a year, in May/June and
 * November/December, and the dates for the following year appear on their page
 * by 1 October. So this needs updating roughly twice a year, and the whole
 * card refuses to draw once the date is past rather than counting downwards
 * into the negative: a confidently wrong date here costs somebody a year and a
 * fee, so no card is the safe failure.
 * Source: https://danskogproever.dk/tilmeldingsfrister-og-proevedatoer/
 */
const EXAM = {
  date: '2026-11-25',
  checked: '2026-08-13',
  source: 'https://danskogproever.dk/tilmeldingsfrister-og-proevedatoer/',
};
const NUMERAL = ['Nul', 'Én', 'To', 'Tre', 'Fire', 'Fem', 'Seks', 'Syv', 'Otte', 'Ni', 'Ti'];

const state = {
  guide: null,
  bank: [],
  stories: [],
  best: {},
  hallStats: {},
  battles: [],
  review: {},
  sound: false,
  run: null,
};
let welcomeHall = null;
let welcomeMode = null;
const sfx = createSound(() => state.sound);
const explanations = createExplanations(state, { topicIcon, topicKey, topicLabel });
const { sitting, materialLink, materialSource, buildWhy, examReview } = explanations;

/* ============================================================
   Persistence
   ============================================================ */
function load() {
  Object.assign(state, { guide: null, best: {}, hallStats: {}, battles: [], review: {}, cleared: 0, sound: false });
  if (!state.profile) return;
  try {
    Object.assign(state, JSON.parse(store().getItem(state.profile.key) ?? '{}'));
  } catch { /* corrupt or blocked storage is not worth a crash */ }
}
function save() {
  if (!state.profile) return;
  try {
    store().setItem(state.profile.key, JSON.stringify({
      guide: state.guide, best: state.best, hallStats: state.hallStats, battles: state.battles,
      review: state.review, sound: state.sound, cleared: state.cleared,
    }));
  } catch { /* private mode: run without persistence rather than fail */ }
}

const runKey = () => state.profile ? `felag.run.${state.profile.slug}` : null;

function checkpointRun() {
  if (!state.run || !runKey()) return;
  const { mode, seed, questions, marks, choices, deadline, ghost } = state.run;
  sessionStorage.setItem(runKey(), JSON.stringify({
    modeId: mode.id, seed, questionIds: questions.map((q) => q.id), marks, choices, deadline, ghost,
  }));
}

function clearRun() {
  if (runKey()) sessionStorage.removeItem(runKey());
}

function rememberAnswer(question, right, persist = true) {
  reviewStore.remember(state.review, question, right, usable);
  if (persist) save();
}

function dueQuestions() {
  return reviewStore.due(state.review, state.bankById, usable);
}

function reviewMode() {
  return reviewStore.mode(state.review, state.bankById, usable, shuffle);
}

/* ============================================================
   Modes
   ============================================================ */
const MODES = [
  {
    id: 'ovelse', da: 'Øvelse', en: 'Practice', accent: '--freja', icon: 'grundtvig',
    blurb: 'Tilfældige spørgsmål fra lærematerialet, vægtet efter hvor ofte SIRI faktisk har stillet dem.',
    tag: '15 spørgsmål pr. omgang', training: true,
    build: (rand) => weighted(pool('laeremateriale'), 15, rand),
  },
  {
    id: 'dyst', da: 'Dysten', en: 'The duel', accent: '--bjorn', icon: 'defence',
    blurb: 'Ro om kap med Bjørn over 15 spørgsmål. Båden flytter sig efter rigtige svar, ikke efter tid, så det er præcision der afgør det.',
    tag: 'Mod Bjørn',
    duel: true,
    build: (rand) => weighted(pool('laeremateriale'), 15, rand),
  },
  {
    id: 'tid', da: 'Tidslinjen', en: 'The timeline', accent: '--astrid', icon: 'viking',
    blurb: 'Danmarks historie fra vikingetiden til i dag, periode for periode. Det største kapitel og det, der fylder mest på prøven.',
    tag: '12 perioder',
    teaches: 'time',
  },
  {
    id: 'ting', da: 'Tinget', en: 'The values assembly', accent: '--ingrid', icon: 'justice',
    blurb: 'De 5 værdispørgsmål. Du skal have mindst 4 rigtige, ellers dumper du hele prøven uanset resten. Lær principperne først.',
    tag: 'Kræver 4 af 5',
    teaches: true, ting: true,
    build: (rand) => pick(pool('vaerdier'), RULES.values, rand),
    gate: { need: RULES.valuesPass, of: RULES.values },
  },
  {
    id: 'alting', da: 'Altinget', en: 'The full assembly', accent: '--thor', icon: 'parliament',
    blurb: '45 spørgsmål på 45 minutter med prøvens beståkrav. Svar og forklaringer vises først, når du afleverer.',
    tag: '45 spørgsmål',
    build: (rand) => [
      ...pick(pool('laeremateriale'), 35, rand),
      // Only the freshest current-affairs questions, and even those are
      // labelled. On the day, these five will be about your own year.
      ...pick(recent(pool('aktuelt')), 5, rand),
      ...pick(pool('vaerdier'), 5, rand),
    ],
    exam: true,
  },
];

const DESTINATIONS = [
  {
    id: 'stories', da: 'Fortællinger', en: 'Connected learning', accent: '--astrid', icon: 'book',
    blurb: 'Mennesker, begivenheder og kultur samlet i kildebelagte historier, så fakta bliver til forståelse.',
    tag: 'Læs · forbind · husk',
  },
  {
    id: 'sagaer', da: 'Sagaerne', en: 'The reading rooms', accent: '--gorm', icon: 'book',
    blurb: 'Forklaringer fra lærematerialet: hvert kapitel lagt ud efter hvor meget SIRI har spurgt om siderne.',
    tag: 'Aldrig låst',
  },
  {
    id: 'training', da: 'Træning', en: 'Practice routes', accent: '--freja', icon: 'grundtvig',
    blurb: 'Øvelse, Tidslinjen og Tinget samlet ét sted. Vælg det, du vil træne.', tag: '3 træningsrum',
  },
  {
    id: 'dyst', da: 'Dysten', en: 'The battle', accent: '--bjorn', icon: 'defence',
    blurb: 'Mål dig mod Bjørn eller en dansk viking i de samme 15 spørgsmål.', tag: 'Kampplads',
  },
  {
    id: 'alting', da: 'Altinget', en: 'The full test', accent: '--thor', icon: 'parliament',
    blurb: '45 spørgsmål på 45 minutter. Feedback og kilder vises efter aflevering.', tag: '45 spørgsmål',
  },
];

function modeCard(mode, index) {
  const best = mode.id === 'review' ? undefined : state.best[mode.id];
  const scoringMode = MODES.find((item) => item.id === mode.id) ?? mode;
  const total = scoringMode.exam ? RULES.total
    : scoringMode.gate?.of ?? (scoringMode.duel || scoringMode.training ? 15 : null);
  return `<button class="mode" type="button" data-id="${mode.id}"
      style="--accent:var(${mode.accent}); --d:${index * 0.08}s">
      <span class="mode-title">${topicIcon(mode.icon, `mode-icon ${mode.id}`)}${mode.da} ${Number.isFinite(best) ? `<span class="best">bedste ${best}${total ? `/${total}` : ''}</span>` : ''}</span>
      <span class="en">${mode.en}</span>
      <p>${mode.blurb}</p>
      <span class="tag">${mode.tag}</span>
    </button>`;
}

/** Each mode keeps its own place, including on the result screen. */
const sceneFor = (mode) => (mode.ting ? 'ting' : mode.exam ? 'alting' : 'hall');

/** The hall list and the saga map are two doors into the same six rooms, so
    a hall returns through whichever one it was entered by. */
let hallDoor = showHalls;

/** Sagaerne is reachable from the hall list and from the path, so leaving a
    reading room goes back the way it was entered rather than always to one. */
let resultMode = null;
let currentStory = null;
let navigation = null;
let reading = null;
let halls = null;
const showPath = () => { renderPath(); go('viewPath', 'path'); };
let assemblyDoor = showPath;

const hallState = (...args) => halls.stateAt(...args);
const hallMode = (hall, index) => halls.mode(hall, index);
const renderLearningPath = () => halls.renderPath();
const renderWelcomeJourney = () => halls.renderWelcome(RUNESTONE_ICON);

const RESTORABLE_VIEWS = new Set([
  'viewPath', 'viewTraining', 'viewHalls', 'viewSagaer', 'viewStories', 'viewStory',
  'viewSagas', 'viewMap', 'viewTime', 'viewArena', 'viewTing',
]);
const routeKey = () => state.profile ? `felag.route.${state.profile.slug}` : null;

function routeFor(view) {
  if (!RESTORABLE_VIEWS.has(view)) return null;
  if (view === 'viewStory') return currentStory ? { view, story: currentStory.id } : null;
  if (view === 'viewSagas') return reading?.currentHall() ? { view, chapter: reading.currentHall().chapter } : null;
  if (view === 'viewTing') return { view, origin: assemblyDoor === showMap ? 'map' : 'training' };
  return { view };
}

function restoreRoute(route) {
  if (!route || !RESTORABLE_VIEWS.has(route.view)) return false;
  if (route.view === 'viewPath') showPath();
  else if (route.view === 'viewTraining') showTraining();
  else if (route.view === 'viewHalls') showHalls();
  else if (route.view === 'viewSagaer') reading.showIndex();
  else if (route.view === 'viewStories') showStories();
  else if (route.view === 'viewStory') {
    const story = state.stories.find((item) => item.id === route.story);
    if (!story) return false;
    showStory(story);
  } else if (route.view === 'viewSagas') {
    const hall = HALLS.find((item) => item.chapter === route.chapter);
    if (!hall) return false;
    reading.showHall(hall, null, showHalls);
  } else if (route.view === 'viewMap') showMap();
  else if (route.view === 'viewTime') showTime();
  else if (route.view === 'viewArena') showArena();
  else if (route.view === 'viewTing') {
    assemblyDoor = route.origin === 'map' ? showMap : showTraining;
    showTing();
  }
  return true;
}

/** Leaving a drill returns where it was started from, not to the map. */
const leave = (mode) => mode?.hall ? hallDoor()
  : mode?.story ? showStory(mode.story)
  : mode?.review ? showPath()
  : mode?.training ? showTraining()
  : mode?.id === 'ting' || mode?.exam ? assemblyDoor()
  : mode?.ting ? showTing()
  : mode?.time ? showTime()
  : mode?.duel ? showArena()
  : showPath();

/**
 * Outdated questions never enter a draw.
 *
 * A wrong answer presented as current is the worst thing this project can do,
 * so anything hand-checked and found stale is excluded outright rather than
 * shown with a caveat. "Hvilket politisk parti er i regering?" answered
 * Socialdemokratiet in 2020; since 2022 it has been an S, V and M coalition.
 *
 * Current-affairs questions never repeat between papers (0 of 65), so drilling
 * them teaches facts that were true on one afternoon years ago. They are kept
 * out of practice entirely and appear only in the full mock, where the paper's
 * shape matters and each is labelled with the sitting it came from.
 */
const usable = (q) => q.status !== 'outdated';

const pool = (section) => state.bank.filter((q) => q.section === section && usable(q));
function pick(list, n, rand) {
  const out = [];
  const stems = new Set();
  for (const question of shuffle(list, rand)) {
    if (stems.has(question.stem)) continue;
    stems.add(question.stem);
    out.push(question);
    if (out.length === Math.min(n, list.length)) break;
  }
  return out;
}

/** The newest sittings only; older current-affairs answers have moved on. */
function recent(list) {
  const latest = (q) => q.seen.map((s) => s.split('#')[0]).sort().at(-1);
  const newest = list.map(latest).sort().at(-1) ?? '';
  const cutoff = String(Number(newest.slice(0, 4)) - 1);
  return list.filter((q) => latest(q) >= cutoff);
}

/** Frequency-weighted draw: questions SIRI asks often come up more.
    Takes the run's own generator, so the same seed always yields the same paper
    and two people can be given an identical one. */
function weighted(list, n, rand) {
  const bag = list.flatMap((q) => Array(Math.min(q.seen.length, 4)).fill(q));
  const out = [];
  const taken = new Set();
  const stems = new Set();
  let guard = 0;
  while (out.length < Math.min(n, list.length) && bag.length && guard++ < 5000) {
    const q = bag[Math.floor(rand() * bag.length)];
    if (!taken.has(q.id) && !stems.has(q.stem)) {
      taken.add(q.id);
      stems.add(q.stem);
      out.push(q);
    }
  }
  return out;
}

/* ============================================================
   Views
   ============================================================ */
const VIEWS = ['viewWho', 'viewShore', 'viewPath', 'viewTraining', 'viewHalls', 'viewSagaer', 'viewStories', 'viewStory', 'viewSagas', 'viewMap', 'viewTime', 'viewArena', 'viewTing', 'viewQuiz', 'viewResult'];
function go(id, scene) {
  const swap = () => {
    // The counter and clock belong to a run; nothing else should inherit them.
    if (id !== 'viewQuiz') {
      $('hudMeta').textContent = '';
      $('hudMeta').removeAttribute('aria-label');
    }
    VIEWS.forEach((v) => { $(v).hidden = v !== id; });
    if (scene) scenes.show(scene);
    $('hud').hidden = id === 'viewShore' || id === 'viewWho' || id === 'viewPath';
    scrollTo({ top: 0, behavior: 'auto' });
    navigation?.checkpoint(routeFor(id));
    requestAnimationFrame(() => {
      if (!$('welcome').hidden) return;
      const heading = $(id).querySelector('h1,h2');
      if (!heading) return;
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
      document.title = `${heading.textContent.trim()} | Félag`;
    });
  };
  // Native view transitions; browsers without it simply get the swap.
  document.startViewTransition && !scenes.still.matches ? document.startViewTransition(swap) : swap();
}

/* ---------- who is studying ---------- */
const escape = (t) => t.replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function renderPeople() {
  const list = people();
  $('profiles').innerHTML = list.map((name, i) => {
    const safe = escape(name);
    let done = 0;
    try { done = JSON.parse(localStorage.getItem(keyFor(slugify(name))) ?? '{}').cleared ?? 0; }
    catch { /* ignore */ }
    return `<span class="profile-row">
        <button class="profile" type="button" data-name="${safe}" style="--d:${i * 0.05}s">
          <span class="mark">${safe.slice(0, 1).toUpperCase()}</span>
          <span><b>${safe}</b><small>${done ? `${done} af 6 porte åbnet` : 'ingen porte åbnet endnu'}</small></span>
        </button>
        <button class="drop" type="button" data-drop="${safe}" aria-label="Fjern ${safe}">&times;</button>
      </span>`;
  }).join('');
  $('newProfile').querySelector('input').placeholder = list.length ? 'Nyt navn' : 'Dit navn';
}

function resumeJourney() {
  if (!state.profile) return showWho();
  if (!state.guide) return go('viewShore', 'shore');
  const hallIndex = welcomeHall;
  const mode = welcomeMode;
  welcomeHall = null;
  welcomeMode = null;
  if (mode === 'alting') return start('alting');
  if (hallIndex !== null && hallState(hallIndex) !== 'shut') {
    return start(null, hallMode(HALLS[hallIndex], hallIndex));
  }
  renderPath();
  go('viewPath', 'path');
}

function useProfile(name, { guest = false } = {}) {
  state.profile = guest
    ? { name: 'Gæst', slug: 'gaest', key: 'felag.guest', guest: true }
    : { name, slug: slugify(name), key: keyFor(slugify(name)), guest: false };
  currentStory = null;
  load();
  if (guest) sessionStorage.setItem(ACTIVE_GUEST, 'true');
  else {
    localStorage.setItem(ACTIVE_PROFILE, state.profile.slug);
    sessionStorage.removeItem(ACTIVE_GUEST);
  }
  $('foot').hidden = false;
  $('whoNow').textContent = state.profile.name;
  $('soundToggle').textContent = state.sound ? 'Lyd: til' : 'Lyd: fra';
  $('soundToggle').setAttribute('aria-pressed', String(state.sound));
  renderShore();
  if (restoreRun()) return;
  if (state.pendingChallenge) {
    const challenge = state.pendingChallenge;
    state.pendingChallenge = null;
    const mode = modeById(challenge.modeId);
    if (mode) {
      history.replaceState(null, '', location.pathname);
      return start(mode.id, mode, { ...challenge, name: 'Vikingen' });
    }
  }
  if (state.guide) {
    choose(state.guide);
    if (navigation?.entered() && navigation.restoreSaved()) return;
    return resumeJourney();
  }
  go('viewShore', 'shore');
}

function showWho() {
  $('foot').hidden = true;
  renderPeople();
  go('viewWho', 'landfall');
}

/* ---------- shore ---------- */
function renderShore() {
  $('roster').innerHTML = CAST.map((c, i) => `
    <button class="char" type="button" data-id="${c.id}" aria-pressed="false"
      style="--accent:var(${c.accent}); --d:${i * 0.07}s">
      <figure>${c.svg}</figure>
      <b>${c.name}</b><span>${c.style}</span>
    </button>`).join('');

}

function choose(id) {
  const c = byId(id);
  state.guide = id;
  save();
  document.querySelectorAll('.char').forEach((el) =>
    el.setAttribute('aria-pressed', String(el.dataset.id === id)));
  const banner = $('banner');
  banner.style.setProperty('--accent', `var(${c.accent})`);
  banner.innerHTML = `
    <span class="banner-name" style="color:var(${c.accent})">${c.name} &middot; ${c.style}</span>
    <span class="banner-line">&ldquo;${c.quote}&rdquo;</span>
    <span class="banner-strength">${c.strength}</span>`;
  $('beginBtn').disabled = false;
  sfx.select();
}

/* ---------- path ---------- */
function renderPath() {
  const c = byId(state.guide) ?? CAST[0];
  $('walker').innerHTML = c.svg;
  $('guideName').textContent = c.name;
  $('pathSub').textContent = c.recommends;

  renderLearningPath();
  const due = dueQuestions();
  const destinations = due.length ? [{
    id: 'review', da: 'Dagens genbesøg', en: 'Spaced review', accent: '--green', icon: 'grundtvig',
    blurb: 'Fakta, du tidligere har mødt, vender tilbage på det tidspunkt, hvor hukommelsen har mest gavn af at hente dem frem.',
    tag: `${due.length} spørgsmål klar`,
  }, ...DESTINATIONS] : DESTINATIONS;
  $('modes').innerHTML = destinations.map(modeCard).join('');
  renderExamDate();
}

/* Whole calendar days from today to an ISO date, counted on the day boundary
   rather than on the clock, so "i morgen" does not become "i dag" at 23:59. */
function daysTo(iso) {
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((Date.parse(`${iso}T00:00:00Z`) - today) / 86400000);
}

function renderExamDate() {
  const left = daysTo(EXAM.date);
  // Past its own date it knows only that it is out of date, so it stops
  // counting and points at the table that is still right.
  if (left < 0) {
    $('examDate').innerHTML = `<em>Næste prøvedato offentliggøres af
      <a href="${EXAM.source}" target="_blank" rel="noopener">SIRI</a>.</em>`;
    return;
  }
  // No weekday: it is one more word between you and the date itself.
  const when = new Intl.DateTimeFormat('da-DK', { day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date(`${EXAM.date}T00:00:00Z`));
  $('examDate').innerHTML = `
    <span class="landing-boat" aria-hidden="true">${BOAT}</span>
    <b>${left === 0 ? 'I dag' : `${left} ${left === 1 ? 'dag' : 'dage'}`}</b>
    <em>${left === 0
      ? 'Indfødsretsprøven er i dag.'
      : `til Indfødsretsprøven · den <a href="${EXAM.source}" target="_blank" rel="noopener" title="Kontrolleret ${EXAM.checked}">${when}</a>`}</em>`;
}

function showTraining() {
  $('hudTitle').textContent = 'Træning';
  $('hudBackLabel').textContent = 'Tilbage til vejen';
  $('hudBack').setAttribute('aria-label', 'Tilbage til vejen');
  $('hudBack').dataset.tooltip = 'Tilbage til vejen';
  $('trainingSigil').innerHTML = topicIcon('book');
  $('trainingModes').innerHTML = MODES.filter((mode) => mode.training || mode.teaches).map(modeCard).join('');
  go('viewTraining', 'path');
}

function showHalls() {
  hallDoor = showHalls;
  halls.show();
}

/* ============================================================
   Fortællinger · facts joined into sourced understanding
   ============================================================ */
function storyMode(story) {
  return storyView.mode(story, state.bankById, usable);
}

function showStories() {
  $('hudTitle').textContent = 'Fortællinger';
  $('hudBackLabel').textContent = 'Tilbage til vejen';
  $('hudBack').setAttribute('aria-label', 'Tilbage til vejen');
  $('hudBack').dataset.tooltip = 'Tilbage til vejen';
  $('storyList').innerHTML = storyView.list(state.stories, state.best, ICON.chevron);
  storyDeck.restore(currentStory?.id ?? null);
  go('viewStories', 'hall');
}

function showStory(story) {
  currentStory = story;
  $('hudTitle').textContent = story.title;
  $('hudBackLabel').textContent = 'Tilbage til Fortællinger';
  $('hudBack').setAttribute('aria-label', 'Tilbage til Fortællinger');
  $('hudBack').dataset.tooltip = 'Tilbage til Fortællinger';
  $('storyEyebrow').textContent = story.eyebrow;
  $('storyTitle').textContent = story.title;
  $('storyIntro').textContent = story.intro;
  const content = storyView.content(story, materialSource, topicIcon);
  $('storyConnections').innerHTML = content.connections;
  $('storyTimeline').innerHTML = content.timeline;
  $('storySections').innerHTML = content.sections;
  $('storySources').innerHTML = content.sources;
  $('storyQuiz').innerHTML = content.quiz;
  go('viewStory', 'hall');
}

/* ---------- the saga map ---------- */

const GATE_LABEL = { done: 'Ryddet', attempted: 'Prøvet', open: 'Åben', shut: 'Låst' };

/**
 * The eight stops, in the order they are walked.
 *
 * The halls are gated: clear one and the next opens. The two assemblies are
 * not, and must never be drawn as though they were. The papers have been open
 * from the first day on purpose, so that someone sitting the test next week
 * can go straight to it without first grinding six halls they have no time
 * for. A locked Alting would be a lie about how this project works.
 */
function stops() {
  const cleared = state.cleared ?? 0;
  const assembly = (id, kind) => {
    const mode = MODES.find((m) => m.id === id);
    const gate = Number.isFinite(state.best[id]) ? 'attempted' : 'open';
    return {
      kind, name: mode.da, accent: mode.accent, gate,
      state: GATE_LABEL[gate],
      aria: `${mode.da}, ${mode.en}. ${GATE_LABEL[gate]}. Altid åben.`,
    };
  };
  return [
    ...HALLS.map((hall, i) => {
      const gate = hallState(i, cleared);
      return {
        kind: 'hall', numeral: hall.numeral, name: hall.da, accent: hall.accent, gate,
        state: GATE_LABEL[gate],
        aria: `Hal ${hall.numeral}, ${hall.da}. ${GATE_LABEL[gate]}.`,
      };
    }),
    assembly('ting', 'ting'),
    assembly('alting', 'alting'),
  ];
}

function showMap() {
  hallDoor = showMap;
  $('hudTitle').textContent = 'Kortet';
  $('hudBackLabel').textContent = 'Tilbage til vejen';
  $('hudBack').setAttribute('aria-label', 'Tilbage til vejen');
  $('hudBack').dataset.tooltip = 'Tilbage til vejen';
  saga.render($('map'), stops(), state.guide, (i) => {
    if (i < HALLS.length) return start(null, hallMode(HALLS[i], i));
    // The Ting teaches its principles before it tests them, the same as it
    // does from the path; the map is another door into the room, not a
    // shortcut past it.
    assemblyDoor = showMap;
    return i === HALLS.length ? showTing() : start('alting');
  });
  go('viewMap', 'path');
}

/* ---------- Arena ---------- */
const RESULT_MARK = {
  won: `<svg viewBox="0 0 24 24" fill="none"><path d="M12 3 5 6v6c0 5 3 8 7 10 4-2 7-5 7-10V6l-7-3Z"/><path d="m8 12 3 3 5-6"/></svg>`,
  lost: `<svg viewBox="0 0 24 24" fill="none"><path d="M12 3 5 6v6c0 5 3 8 7 10 4-2 7-5 7-10V6l-7-3Z"/><path d="m9 9 6 6m0-6-6 6"/></svg>`,
  draw: `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9"/><path d="M7 12h10"/></svg>`,
};

/**
 * The banner you sail home under. Raised on a spear when the throne holds,
 * struck and torn from a broken staff when it does not, and furled around the
 * shaft when neither side took the field. Drawn rather than lettered, because
 * you should be able to tell how it went from across the room.
 */
const BANNER = {
  won: `<svg viewBox="0 0 76 76" fill="none" aria-hidden="true">
    <path class="banner-gust" d="M60 21h10M62 30h9M60 39h10" stroke="#d3a24c" stroke-width="2.6" stroke-linecap="round" opacity=".3"/>
    <path d="M16 2 21 12h-10l5-10Z" fill="#d3a24c"/>
    <path d="M16 10v60" stroke="#d3a24c" stroke-width="3.4" stroke-linecap="round"/>
    <path class="banner-cloth" d="M17 14h39l-9 13 9 13H17Z" fill="#c8102e"/>
    <path class="banner-cloth" d="M31 14v26M17 27h30" stroke="#efe3c8" stroke-width="5"/>
    <path d="M4 70h26" stroke="#d3a24c" stroke-width="3" stroke-linecap="round" opacity=".5"/>
  </svg>`,
  lost: `<svg viewBox="0 0 76 76" fill="none" aria-hidden="true">
    <path d="M14 70 19 44" stroke="#7d6a4e" stroke-width="3.4" stroke-linecap="round"/>
    <path d="m21 40 6-22" stroke="#7d6a4e" stroke-width="3.4" stroke-linecap="round"/>
    <path class="banner-cloth" d="M28 17h33l-7 12 6 12-9-6-6 10-7-9-8 8Z" fill="#7e3427"/>
    <path class="banner-cloth" d="M42 18v22M29 27h27" stroke="#9c8a6e" stroke-width="5"/>
    <path d="M4 70h30" stroke="#7d6a4e" stroke-width="3" stroke-linecap="round" opacity=".45"/>
  </svg>`,
  draw: `<svg viewBox="0 0 76 76" fill="none" aria-hidden="true">
    <path d="M20 6v64M56 6v64" stroke="#8fae8c" stroke-width="3.4" stroke-linecap="round"/>
    <path class="banner-cloth" d="M21 16h14v20l-7-6-7 6Z" fill="#8fae8c" opacity=".85"/>
    <path class="banner-cloth" d="M41 16h14v20l-7-6-7 6Z" fill="#8fae8c" opacity=".85"/>
    <path d="M4 70h68" stroke="#8fae8c" stroke-width="3" stroke-linecap="round" opacity=".45"/>
  </svg>`,
};

/** What the hall shouts when you walk back in. */
const DUEL_CRY = (result, them) => ({
  won: ['Sejr', 'Du beholder din trone, viking!', `${them} ror hjem med tom snekke. Skjoldtavlen har fået et mærke mere.`],
  lost: ['Nederlag', 'Er du sikker på, du er viking?', `${them} tog tronen. Slib øksen, og kræv den tilbage.`],
  draw: ['Uafgjort', 'Ingen tog tronen i dag.', `Skjold mod skjold. Du og ${them.toLowerCase()} nåede land på samme åretag.`],
}[result]);

/* The feed opens on the last ten and grows on request. Old duels are worth
   keeping, but nobody arrives at the arena wanting to read thirty of them. */
const BATTLE_PAGE = 10;
let battlesShown = BATTLE_PAGE;

function showArena() {
  $('hudTitle').textContent = 'Dysten';
  $('arenaBjorn').innerHTML = byId('bjorn').svg;
  battlesShown = BATTLE_PAGE;
  renderBattles();
  go('viewArena', 'hall');
}

function renderBattles() {
  const battles = state.battles ?? [];
  const won = battles.filter((battle) => battle.result === 'won').length;
  const lost = battles.filter((battle) => battle.result === 'lost').length;
  const drawn = battles.filter((battle) => battle.result === 'draw').length;
  const total = battles.length;
  const rate = total ? Math.round((won / total) * 100) : 0;
  const stats = [
    ['won', 'Sejre', won], ['lost', 'Tabt', lost], ['draw', 'Uafgjort', drawn],
  ];
  $('battleForm').textContent = total ? `${rate}% sejrsrate` : 'Klar til kamp';
  $('battleRecord').innerHTML = `
    <div class="record-hero ${total ? '' : 'empty'}">
      <span class="record-shield">${RESULT_MARK.won}</span>
      <span><small>${total ? 'Din sejrsrate' : 'Dit første mærke'}</small><b>${total ? `${rate}%` : 'Klar'}</b><em>${total ? `${won} af ${total} kampe vundet` : 'Vælg en modstander og sæt sejl.'}</em></span>
    </div>
    ${stats.map(([result, label, count]) => `<span class="record-total ${result}" aria-label="${count} ${label.toLowerCase()}">${RESULT_MARK[result]}<b>${count}</b><small>${label}</small></span>`).join('')}`;
  const shown = Math.min(battlesShown, total);
  const rest = total - shown;
  $('battleList').innerHTML = total
    ? `<p class="match-feed-title">Skjoldtavlen · ${total} ${total === 1 ? 'kamp' : 'kampe'}</p>${battles.slice(0, shown).map((battle) => `
      <div class="match ${battle.result}">
        <span class="match-mark">${RESULT_MARK[battle.result]}</span>
        <span><b>Mod ${escape(battle.opponent)}</b><small>${battle.date}</small></span>
        <span class="match-score" aria-label="${battle.mine} mod ${battle.theirs}"><b>${battle.mine}</b><i>–</i><b>${battle.theirs}</b></span>
        <em>${battle.result === 'won' ? 'Vundet' : battle.result === 'lost' ? 'Tabt' : 'Uafgjort'}</em>
      </div>`).join('')}
      ${rest ? `<button class="match-more" id="battleMore" type="button">Rul tavlen længere tilbage · ${rest} ${rest === 1 ? 'kamp' : 'kampe'} mere</button>` : ''}`
    : `<div class="scoreboard-empty">${RESULT_MARK.won}<span><b>Skjoldtavlen venter.</b> Vælg Bjørn eller kast handsken til en dansk viking.</span></div>`;
  const more = document.getElementById('battleMore');
  if (more) more.onclick = () => {
    battlesShown += BATTLE_PAGE;
    renderBattles();
    const target = document.getElementById('battleMore') ?? $('scoreboardTitle');
    target.tabIndex = -1;
    target.focus();
  };
}

function recordBattle(opponent, mine, theirs) {
  const result = mine > theirs ? 'won' : mine < theirs ? 'lost' : 'draw';
  state.battles = [{
    opponent,
    mine,
    theirs,
    result,
    date: new Intl.DateTimeFormat('da-DK', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date()),
  }, ...(state.battles ?? [])].slice(0, 30);
  return result;
}

/* ---------- Tidslinjen ---------- */
function showTime() {
  $('hudTitle').textContent = 'Tidslinjen';
  $('hudBackLabel').textContent = 'Tilbage til Træning';
  $('hudBack').setAttribute('aria-label', 'Tilbage til Træning');
  $('hudBack').dataset.tooltip = 'Tilbage til Træning';
  const most = Math.max(...state.eras.map((e) => e.questions.length), 1);

  $('eras').innerHTML = state.eras.map((era, i) => {
    const stock = era.questions.filter((id) => usable(byQuestion(id))).length;
    const best = state.best[`tid-${era.page}`];
    // An open end means two different things: the last period is still running,
    // an earlier one simply starts around then and overlaps its neighbours.
    const span = era.to ? `${era.from}\u2013${era.to}`
      : i === state.eras.length - 1 ? `${era.from}\u2013` : `fra ${era.from}`;
    const years = era.to ? `${era.to - era.from} år` : (i === state.eras.length - 1 ? 'til i dag' : '');
    return `<div class="era" style="--d:${i * 0.05}s">
        <span class="knot"></span>
        <span class="axis"><b>${span}</b><span>${years}</span></span>
        <button class="body" type="button" data-i="${i}" ${stock ? '' : 'disabled'}>
          <span class="era-title">${topicIcon(topicKey({ chapter: 1, page: era.page }))}${era.title}</span>
          <span class="weight">
            <i style="width:${Math.round((stock / most) * 100)}px"></i>
            <span>${stock ? `${stock} spørgsmål` : 'ingen spørgsmål'}</span>
          </span>
          ${stock ? `<span class="era-action">${Number.isFinite(best) ? `Bedste ${best}/${Math.min(12, stock)} · ` : ''}Øv perioden</span>` : ''}
        </button>
      </div>`;
  }).join('');
  go('viewTime', 'path');
}

const byQuestion = (id) => state.bank.find((q) => q.id === id) ?? {};

/** A drill on one period of history. */
function eraMode(era) {
  const stock = era.questions.map(byQuestion).filter((q) => q.id && usable(q));
  return {
    id: `tid-${era.page}`, da: era.title, accent: '--astrid', time: era,
    build: (rand) => weighted(stock, Math.min(12, stock.length), rand),
  };
}

/* ---------- Tinget ---------- */
function showTing() {
  $('hudTitle').textContent = 'Tinget';
  const back = assemblyDoor === showMap ? 'Tilbage til Kortet' : 'Tilbage til Træning';
  $('hudBackLabel').textContent = back;
  $('hudBack').setAttribute('aria-label', back);
  $('hudBack').dataset.tooltip = back;
  $('principles').innerHTML = state.principles.map((p, i) => {
    const count = p.questions.filter((id) => usable(byQuestion(id))).length;
    return `
    <div class="principle" data-id="${p.id}" style="--d:${i * 0.05}s">
      <button type="button" aria-expanded="false">
        <span class="principle-title"><span class="n">${String(i + 1).padStart(2, '0')}</span>${p.title}
          <span class="count">${count} spørgsmål</span>
          <span class="chev">${ICON.chevron}</span></span>
        <p class="rule">${p.rule}</p>
      </button>
    </div>`;
  }).join('');
  go('viewTing', 'ting');
}

function togglePrinciple(el) {
  const open = el.classList.toggle('open');
  el.querySelector('button').setAttribute('aria-expanded', String(open));
  el.querySelector('.more')?.remove();
  if (!open) return;

  const p = state.principles.find((x) => x.id === el.dataset.id);
  const count = p.questions.filter((id) => usable(byQuestion(id))).length;
  const more = document.createElement('div');
  more.className = 'more';
  more.innerHTML = `<p>${p.detail}</p>
    <button class="btn primary" type="button" data-practice="${p.id}">
      Øv ${count} spørgsmål</button>`;
  el.append(more);
}

/** A drill on one principle, drawn only from the questions it explains. */
function principleMode(p) {
  const stock = state.bank.filter((q) => p.questions.includes(q.id) && usable(q));
  return {
    id: `princip-${p.id}`, da: p.title, accent: '--ingrid', ting: true,
    build: (rand) => shuffle(stock, rand),
  };
}

/* ---------- quiz ---------- */
/* A rowing boat, oars out. Not a longship under sail: you are the one pulling. */
const BOAT = `<svg viewBox="0 0 38 30" fill="none" xmlns="http://www.w3.org/2000/svg">
  <g class="oars" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity=".85">
    <path d="M13 17 4 11"/><path d="M25 17l9-6"/>
  </g>
  <g class="hull">
    <path d="M6 18c2.4 3.1 7.4 4.4 13 4.4S29.6 21.1 32 18c-3.6 1.4-8.2 1.9-13 1.9S9.6 19.4 6 18Z" fill="currentColor"/>
    <path d="M6.4 17.9C4.6 16.7 4 14.2 5.1 12c.7 1.8 1.8 3.2 3.2 4.3-.7.6-1.3 1.1-1.9 1.6Z" fill="currentColor"/>
    <path d="M31.6 17.9c1.8-1.2 2.4-3.7 1.3-5.9-.7 1.8-1.8 3.2-3.2 4.3.7.6 1.3 1.1 1.9 1.6Z" fill="currentColor"/>
    <circle cx="19" cy="14.5" r="2.4" fill="currentColor"/>
  </g></svg>`;

function start(modeId, override, ghost) {
  const mode = override ?? MODES.find((m) => m.id === modeId);
  const seed = ghost?.seed ?? (Date.now() >>> 0);
  const questions = mode.build(rng(seed)).map((q) => present(q, seed));
  if (!questions.length) return;
  resultMode = null;

  state.run = {
    mode, seed, questions, i: 0, marks: Array(questions.length).fill(null),
    choices: Array(questions.length).fill(null),
    ghost: ghost ?? null,
    deadline: mode.exam ? Date.now() + RULES.minutes * 60000 : null,
  };
  checkpointRun();
  showRun();
}

function showRun() {
  const { mode } = state.run;
  const returnLabel = mode.hall
    ? 'Tilbage til De Seks Haller'
    : (mode.exam || mode.id === 'ting') && assemblyDoor === showMap
    ? 'Tilbage til Kortet'
    : 'Tilbage til vejen og hallerne';
  $('hudTitle').textContent = mode.da;
  $('hudBackLabel').textContent = returnLabel;
  $('hudBack').setAttribute('aria-label', returnLabel);
  $('hudBack').dataset.tooltip = returnLabel;
  go('viewQuiz', sceneFor(mode));
  renderQuestion();
  if (state.run.deadline) tick();
}

function tick() {
  const run = state.run;
  if (!run?.deadline) return;
  const left = run.deadline - Date.now();
  if (left <= 0) {
    run.timedOut = true;
    return finish();
  }
  const clock = `${String(Math.floor(left / 60000)).padStart(2, '0')}:${String(Math.floor(left / 1000) % 60).padStart(2, '0')}`;
  $('hudMeta').textContent = `${run.i + 1} / ${run.questions.length} · ${clock}`;
  $('hudMeta').setAttribute('aria-label', `Spørgsmål ${run.i + 1} af ${run.questions.length}. Tid tilbage ${clock}.`);
  setTimeout(tick, 1000);
}

/**
 * A challenge is a seed plus a record of who got what right, small enough to
 * live in a link. No server, no accounts: the run rebuilds itself from the seed,
 * so both people are given exactly the same paper in the same order.
 */
const packRun = (run) => [
  run.mode.id, run.seed.toString(36),
  run.marks.map((m) => (m === true ? '1' : m === false ? '0' : 'x')).join(''),
].join('~');

function unpackRun(text) {
  const [id, seed, bits] = (text ?? '').split('~');
  if (!id || !seed || !bits || !/^[01x]+$/.test(bits)) return null;
  return {
    modeId: id,
    seed: parseInt(seed, 36),
    marks: [...bits].map((b) => b === 'x' ? null : b === '1'),
  };
}

/** Rebuild any mode from the id stored in a challenge link. */
function modeById(id) {
  if (id === 'review') return reviewMode();
  if (id?.startsWith('hal-')) {
    const n = Number(id.slice(4));
    const i = HALLS.findIndex((h) => h.chapter === n);
    return i < 0 || hallState(i) === 'shut' ? null : hallMode(HALLS[i], i);
  }
  if (id?.startsWith('tid-')) {
    const era = state.eras.find((e) => e.page === Number(id.slice(4)));
    return era ? eraMode(era) : null;
  }
  if (id?.startsWith('princip-')) {
    const p = state.principles.find((x) => x.id === id.slice(8));
    return p ? principleMode(p) : null;
  }
  if (id?.startsWith('story-')) {
    const story = state.stories.find((item) => item.id === id.slice(6));
    return story ? storyMode(story) : null;
  }
  return MODES.find((m) => m.id === id) ?? null;
}

function restoreRun() {
  if (!runKey()) return false;
  let saved;
  try { saved = JSON.parse(sessionStorage.getItem(runKey()) ?? 'null'); }
  catch { clearRun(); return false; }
  if (!saved) return false;
  const mode = modeById(saved.modeId);
  const questions = saved.questionIds?.map((id) => state.bankById.get(id)).filter(Boolean);
  if (!mode || questions?.length !== saved.questionIds.length || saved.marks?.length !== questions.length) {
    clearRun();
    return false;
  }
  state.run = {
    mode,
    seed: saved.seed,
    questions: questions.map((question) => present(question, saved.seed)),
    i: Math.min(saved.marks.findIndex((mark) => mark === null), questions.length - 1),
    marks: saved.marks,
    choices: saved.choices ?? Array(questions.length).fill(null),
    deadline: saved.deadline ?? null,
    ghost: saved.ghost ?? null,
  };
  if (state.run.i < 0) {
    state.run.i = questions.length - 1;
    finish();
    return true;
  }
  showRun();
  return true;
}

/** Bjørn does not need a recorded run: his is derived from the same seed. */
function houseGhost(seed, accuracy = 0.72) {
  const rand = rng(seed ^ 0x5bd1e995);
  return { seed, name: 'Bjørn', house: true,
           marks: Array.from({ length: 64 }, () => rand() < accuracy) };
}

/** Advance the crossing by correct answers; the duel is a race on accuracy. */
function renderRow(stroke) {
  const { marks, ghost, mode } = state.run;
  const row = $('row');
  $('rowTrack').innerHTML = marks
    .map((mark) => `<i class="${mode.exam && mark !== null ? 'answered' : mark === true ? 'hit' : mark === false ? 'miss' : ''}"></i>`).join('');
  $('rowBoat').innerHTML = BOAT;
  $('rowGhost').innerHTML = state.run.ghost ? BOAT : '';
  $('rowGhost').hidden = !state.run.ghost;
  // Position is correct answers, not questions seen. The race is on accuracy,
  // which is what the exam actually measures.
  const answered = marks.filter((m) => m !== null).length;
  const mine = mode.exam ? answered : marks.filter(Boolean).length;

  row.style.setProperty('--p', `${2 + (mine / marks.length) * 90}%`);

  if (ghost) {
    const theirs = ghost.marks.slice(0, answered).filter(Boolean).length;
    row.style.setProperty('--g', `${2 + (theirs / marks.length) * 90}%`);
    row.classList.toggle('behind', answered > 0 && mine < theirs);
  }
  row.classList.toggle('sinking', Boolean(state.run.sunk));

  if (!stroke) return;
  row.classList.remove('stroke', 'stumble');
  void row.offsetWidth;                       // restart the animation
  row.classList.add(stroke === 'miss' ? 'stumble' : 'stroke');
}

function renderQuestion() {
  const run = state.run;
  const q = run.questions[run.i];
  const letters = q.options.map((_, index) => String.fromCharCode(65 + index));
  const topic = topicKey(q);
  const topicName = q.section === 'aktuelt'
    ? `Aktuelt fra ${sitting(q.seen.at(-1))}`
    : topicLabel(topic);

  if (!run.deadline) {
    $('hudMeta').textContent = `${run.i + 1} / ${run.questions.length}`;
    $('hudMeta').setAttribute('aria-label', `Spørgsmål ${run.i + 1} af ${run.questions.length}.`);
  }
  $('quizStatus').textContent = '';
  renderRow();
  $('quizNext').disabled = true;
  const nextLabel = run.i === run.questions.length - 1 ? 'Læg til ved land' : 'Sejl videre';
  $('quizNextLabel').textContent = nextLabel;
  $('quizNext').setAttribute('aria-label', nextLabel);
  $('quizNext').dataset.tooltip = nextLabel;

  $('quizCard').innerHTML = `
    <div class="q-topic">${topicIcon(topic)}<span>${topicName}</span></div>
    <h2 class="q" id="questionTitle" tabindex="-1">${q.q}</h2>
    ${q.options.map((o, n) => `
      <button class="opt" type="button" data-n="${n}" style="--d:${n * 0.05}s">
        <em>${letters[n]}</em><span>${o}</span>
      </button>`).join('')}`;

  $('quizCard').querySelectorAll('.opt').forEach((btn) =>
    btn.addEventListener('click', () => answer(Number(btn.dataset.n)), { once: true }));
  requestAnimationFrame(() => $('questionTitle').focus({ preventScroll: true }));
}

function sinkReason(run) {
  if (!run.mode.hall && !run.mode.gate) return null;
  const wrong = run.marks.filter((mark) => mark === false).length;
  const pass = run.mode.hall
    ? Math.ceil(run.questions.length * HALL_PASS)
    : run.mode.gate.need;
  const fatal = run.questions.length - pass + 1;
  if (wrong >= fatal) {
    return `${NUMERAL[wrong] ?? wrong} fejl. Skibet tager for meget vand ind.`;
  }
  return null;
}

function answer(chosen) {
  const run = state.run;
  const q = run.questions[run.i];
  const right = chosen === q.answerAt;
  run.marks[run.i] = right;
  run.choices[run.i] = chosen;
  checkpointRun();
  if (run.mode.hall) {
    const progress = (state.hallStats ??= {})[run.mode.hall.chapter] ??= { seen: [], correct: [] };
    if (!progress.seen.includes(q.id)) progress.seen.push(q.id);
    if (right && !progress.correct.includes(q.id)) progress.correct.push(q.id);
  }
  if (!run.mode.exam) rememberAnswer(q, right, false);
  save();
  const sunk = right ? null : sinkReason(run);
  run.sunk = sunk;

  const opts = [...$('quizCard').querySelectorAll('.opt')];
  opts.forEach((b) => { b.disabled = true; });
  if (run.mode.exam) {
    opts[chosen].classList.add('picked');
    opts[chosen].insertAdjacentHTML('beforeend', '<strong class="opt-result picked">Dit svar</strong>');
    $('quizStatus').textContent = 'Svar gemt.';
    renderRow('stroke');
    $('quizNext').disabled = false;
    return;
  }
  opts[q.answerAt].classList.add('hit');
  opts[q.answerAt].insertAdjacentHTML('beforeend', '<strong class="opt-result">Rigtigt svar</strong>');
  if (!right) {
    opts[chosen].classList.add('miss');
    opts[chosen].insertAdjacentHTML('beforeend', '<strong class="opt-result wrong">Dit svar</strong>');
  }
  right ? sfx.hit() : sunk ? sfx.sink() : sfx.miss();
  renderRow(right ? 'stroke' : 'miss');

  $('quizStatus').textContent = right ? 'Rigtigt.' : `Forkert. Det rigtige svar er ${q.answer}.`;
  const why = buildWhy(q, right);
  $('quizCard').append(why);
  why.tabIndex = -1;
  why.focus({ preventScroll: true });
  if (sunk) {
    $('quizNext').disabled = false;
    $('quizNextLabel').textContent = 'Se resultat';
    $('quizNext').setAttribute('aria-label', 'Se resultat');
    $('quizNext').dataset.tooltip = 'Se resultat';
    return;
  }
  $('quizNext').disabled = false;
}

function next() {
  const run = state.run;
  if (run.sunk) return finish();
  if (run.i >= run.questions.length - 1) return finish();
  run.i++;
  checkpointRun();
  renderQuestion();
}

/* ---------- result ---------- */
function finish() {
  if (!state.run || state.run.finishing) return;
  state.run.finishing = true;
  const { mode, questions, marks } = state.run;
  const finished = state.run;
  const sunk = state.run.sunk;
  const score = marks.filter(Boolean).length;
  const answered = marks.filter((mark) => mark !== null).length;
  const valuesIdx = questions.map((q, i) => (q.section === 'vaerdier' ? i : -1)).filter((i) => i >= 0);
  const valuesScore = valuesIdx.filter((i) => marks[i]).length;

  let passed = null;
  let gate = '';
  if (mode.exam) {
    const okTotal = score >= RULES.pass;
    const okValues = valuesScore >= RULES.valuesPass;
    passed = okTotal && okValues;
    gate = `<div class="gate ${okValues ? 'ok' : 'no'}">
      Værdispørgsmål: <b>${valuesScore} af ${RULES.values}</b> rigtige.
      ${okValues
        ? 'Kravet om mindst 4 er opfyldt.'
        : 'Kravet er mindst 4. Uden det dumper du prøven, uanset din samlede score.'}
    </div>`;
    if (okTotal && !okValues) {
      gate += `<p class="note">Du havde nok rigtige i alt, men værdikravet er en selvstændig hurdle.
        Det er præcis dér, folk falder.</p>`;
    }
  } else if (mode.gate) {
    passed = score >= mode.gate.need;
  } else if (mode.hall) {
    // Decided here, with the other verdicts, so the label below sees it.
    passed = score / questions.length >= HALL_PASS;
  }
  if (sunk) passed = false;

  const label = sunk
    ? 'Skibet sank'
    : mode.exam
    ? (passed ? 'Bestået' : 'Ikke bestået')
    : (passed === null ? 'Gennemført' : passed ? 'Bestået' : 'Ikke bestået');

  const ghost = state.run.ghost;
  // Over the whole paper, not over the part you reached. Your ship sinking is
  // your problem: it does not shorten the crossing the other one already rowed,
  // and scoring them out of `answered` printed a number nobody could reconcile
  // with the "af 15" next to it.
  const theirs = ghost ? ghost.marks.slice(0, questions.length).filter(Boolean).length : null;
  const rival = ghost?.name ?? 'Vikingen';
  const battleResult = ghost ? (score > theirs ? 'won' : score < theirs ? 'lost' : 'draw') : null;
  if (ghost && mode.duel) recordBattle(rival, score, theirs);

  state.best[mode.id] = Math.max(state.best[mode.id] ?? 0, score);
  // Clearing a hall opens the next one, and only ever forwards.
  const wasCleared = state.cleared ?? 0;
  if (mode.hall && passed) {
    state.cleared = Math.max(state.cleared ?? 0, mode.index + 1);
  }
  if (mode.exam) {
    questions.forEach((question, index) => {
      if (marks[index] !== null) rememberAnswer(question, marks[index], false);
    });
  }
  // The prize fires once, at the crossing from "not all" to "all six".
  const wonAll = wasCleared < HALLS.length && state.cleared >= HALLS.length;
  save();
  if (passed !== false) sfx.done();

  // A duel is settled head to head, so the solo score and the neutral
  // "Gennemført" give way to the banner and the two numbers side by side.
  const [cry, shout, aftermath] = ghost ? DUEL_CRY(battleResult, rival) : [];
  const verdict = ghost
    ? `<div class="duel ${battleResult}">
        <span class="duel-banner">${BANNER[battleResult]}</span>
        <p class="duel-cry">${cry}</p>
        <h2 class="duel-shout">${shout}</h2>
        <div class="duel-tally">
          <span class="side"><small>Dig</small><b>${score}</b></span>
          <i aria-hidden="true">–</i>
          <span class="side"><small>${escape(rival)}</small><b>${theirs}</b></span>
        </div>
        <p class="duel-after">${aftermath}</p>
      </div>`
    : `<div class="score ${passed === false ? 'fail' : 'pass'}">${score} / ${sunk ? answered : questions.length}</div>
       <h2 class="verdict">${label}</h2>`;

  // Failing a hall is the moment the reading is worth most, and the gap is
  // already known precisely: these are the ones just got wrong. The room opens
  // on those pages alone rather than on the whole chapter.
  const missed = mode.hall && passed === false
    ? questions.filter((_, i) => marks[i] === false)
    : [];
  const missedPrinciples = mode.gate && passed === false
    ? [...new Set(questions.flatMap((question, index) => marks[index] === false
      ? state.principles.filter((principle) => principle.questions.includes(question.id)).map((principle) => principle.id)
      : []))]
    : [];
  const nextHall = mode.hall && passed && state.cleared > wasCleared && state.cleared < HALLS.length
    ? HALLS[state.cleared]
    : null;
  const eraIndex = mode.time ? state.eras.findIndex((era) => era.page === mode.time.page) : -1;
  const nextEra = eraIndex >= 0 ? state.eras.slice(eraIndex + 1).find((era) => era.questions.some((id) => usable(byQuestion(id)))) : null;
  const guide = byId(state.guide) ?? CAST[0];

  $('resultCard').innerHTML = `
    <p class="lead">${mode.da}</p>
    ${verdict}
    ${sunk ? `<div class="gate no"><b>${sunk}</b> Øv dig, og sæt sejl igen.</div>` : ''}
    ${gate}
    ${ghost
      ? ''
      : mode.hall
      ? `${wonAll ? `<div class="prize">
          <span class="prize-guide" aria-hidden="true" style="--accent:var(${guide.accent})">${guide.svg}</span>
          <b>Alle seks porte er åbnet!</b>
          <span>Du har bestået alle seks haller sammen med ${guide.name}. Nu venter Altinget — hele prøven på tid, under de rigtige regler.</span>
          <button class="btn primary prize-go" id="altingBtn" type="button">${topicIcon('parliament', 'mode-icon alting')}Tag Altinget nu — 45 spørgsmål</button>
        </div>` : ''}
        <p class="note">${passed
          ? (wonAll ? 'Den sidste port er åbnet. Læringsstien er gennemført.' : 'Porten er åbnet. Den næste hal kan nu besøges.')
          : sunk
          ? 'Du nåede ikke frem denne gang. Brug forklaringerne og prøv hallen igen.'
          : `Du skal have ${Math.ceil(questions.length * HALL_PASS)} af ${questions.length} for at rydde hallen. Spørgsmålene blandes hver gang.`}</p>`
      : mode.exam
      ? `<p class="note">${finished.timedOut ? 'Tiden løb ud. ' : ''}Til den rigtige prøve skal du have ${RULES.pass} af ${RULES.total} rigtige.</p>`
      : mode.story
      ? `<p class="note">${score === questions.length
          ? 'Du har samlet fortællingens forbindelser.'
          : 'Læs fortællingen igen, og se hvordan personer, periode og begivenheder hænger sammen.'}</p>`
      : mode.review
      ? `<p class="note">Dagens fakta er planlagt igen ud fra dine svar. Fejl vender tilbage i morgen; sikre svar får længere mellemrum.</p>`
      : `<p class="note">${score === questions.length
          ? 'Fejlfrit. Tag Altinget, når du er klar til hele prøven.'
          : 'Gennemgå de forkerte, og tag den igen. Spørgsmålene blandes hver gang.'}</p>`}
    ${nextHall ? `<button class="journey-next" id="nextHallBtn" type="button">
      <span><small>Næste skridt</small><b>Hal ${nextHall.numeral} · ${nextHall.da}</b></span>
      <svg class="challenge-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m10 5 7 7-7 7m6-7H6"/></svg>
    </button>` : ''}
    ${nextEra ? `<button class="journey-next" id="nextEraBtn" type="button">
      <span><small>Næste periode</small><b>${nextEra.title}</b></span>
      <svg class="challenge-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m10 5 7 7-7 7m6-7H6"/></svg>
    </button>` : ''}
    ${missed.length ? `<button class="read-back" id="sagaBtn" type="button">
      <span class="read-sigil" aria-hidden="true">${ICON.book}</span>
      <span><b>Læs sagaen om det, du missede</b><small>${missed.length}
        ${missed.length === 1 ? 'spørgsmål' : 'spørgsmål'} · med forklaring og sidehenvisning</small></span>
      <svg class="challenge-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m10 5 7 7-7 7m6-7H6"/></svg>
    </button>` : ''}
    ${missedPrinciples.length ? `<button class="read-back" id="principleReviewBtn" type="button">
      <span class="read-sigil" aria-hidden="true">${topicIcon('parliament')}</span>
      <span><b>Gennemgå principperne bag dine fejl</b><small>${missedPrinciples.length} ${missedPrinciples.length === 1 ? 'princip' : 'principper'}</small></span>
      <svg class="challenge-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m10 5 7 7-7 7m6-7H6"/></svg>
    </button>` : ''}
    ${mode.exam ? examReview(finished) : ''}
    <div class="actions ${mode.duel ? 'with-challenge' : ''}">
      <button class="btn primary" id="againBtn" type="button"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 11a8 8 0 1 0 2 5M20 4v7h-7"/></svg>${ghost ? (ghost.house ? 'Kræv omkamp' : 'Sejl igen') : mode.time ? 'Prøv perioden igen' : mode.story ? 'Prøv fortællingen igen' : mode.review ? 'Tilbage til vejen' : 'Få nye spørgsmål'}</button>
      ${mode.duel ? `<button class="challenge-btn" id="shareBtn" type="button" data-tooltip="Din danske viking får det samme sæt spørgsmål og kan slå din score.">
        <span class="challenge-sigil" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none"><path d="m11 39 26-30m-26 0 26 30"/><path d="m8 10 9 2-4 8-7-4 2-6Zm32 0-9 2 4 8 7-4-2-6Z" fill="currentColor"/><path d="M24 19v16M17 35h14"/></svg></span>
        <span><b>Udfordr en dansk viking</b><small>Hvem kender Danmark bedst?</small></span>
        <svg class="challenge-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m10 5 7 7-7 7m6-7H6"/></svg>
      </button>` : ''}
    </div>
    <p class="share-note" id="shareNote" role="status" aria-live="polite" hidden></p>`;

  $('hudMeta').textContent = '';
  resultMode = mode;
  go('viewResult', sceneFor(mode));
  $('againBtn').onclick = () => {
    if (mode.review) return showPath();
    const freshSeed = Date.now() >>> 0;
    start(mode.id, mode, ghost?.house ? houseGhost(freshSeed) : null);
  };
  if (missed.length) {
    $('sagaBtn').onclick = () => {
      reading.showHall(mode.hall, new Set(missed.map((q) => q.id)), hallDoor);
    };
  }
  if (missedPrinciples.length) {
    $('principleReviewBtn').onclick = () => {
      assemblyDoor = showTraining;
      showTing();
      missedPrinciples.forEach((id) => {
        const card = [...document.querySelectorAll('.principle')].find((item) => item.dataset.id === id);
        if (card && !card.classList.contains('open')) togglePrinciple(card);
      });
    };
  }
  if (wonAll) {
    $('altingBtn').onclick = () => start('alting');
  }
  if (nextHall) {
    $('nextHallBtn').onclick = () => start(null, hallMode(nextHall, mode.index + 1));
  }
  if (nextEra) {
    $('nextEraBtn').onclick = () => start(null, eraMode(nextEra));
  }
  if (mode.duel) $('shareBtn').onclick = async () => {
    // The whole challenge travels in the fragment, so nothing is stored anywhere.
    const link = `${location.origin}${location.pathname}#dyst=${packRun(finished)}`;
    const note = $('shareNote');
    const tell = (message) => {
      note.hidden = false;
      note.innerHTML = `${RESULT_MARK.won}<span>${message}</span>`;
    };
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Félag: udfordr en dansk viking', text: 'Hvem kender Danmark bedst?', url: link });
        return tell('Dit løb er delt. Glæd dig til modsvaret.');
      } catch (error) {
        if (error.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(link);
      tell('Dit løb er klar. Linket er kopieret.');
    } catch {
      prompt('Kopiér dit løb:', link);
    }
  };
  clearRun();
  state.run = null;
}

/* ============================================================
   Boot
   ============================================================ */
async function main() {
  scenes.mount($('scene'));
  load();
  const content = await loadContent();
  Object.assign(state, content);
  $('welcomeQuestions').textContent = state.bank.length.toLocaleString('da-DK');
  $('welcomeQuestionCopy').textContent = `en historisk bank på ${state.bank.length.toLocaleString('da-DK')} rigtige spørgsmål`;
  $('shoreQuestionCount').textContent = `En historisk bank på ${state.bank.length.toLocaleString('da-DK')} rigtige spørgsmål`;
  $('welcomePapers').textContent = state.paperCount.toLocaleString('da-DK');
  $('welcomeHalls').textContent = HALLS.length.toLocaleString('da-DK');
  $('valuesAsked').textContent = state.valuesAsked.toLocaleString('da-DK');
  $('valuesUnique').textContent = state.valuesUnique.toLocaleString('da-DK');

  // Anyone who used the app before profiles existed keeps their progress.
  const legacy = localStorage.getItem(LEGACY);
  if (legacy && !people().length) {
    localStorage.setItem(keyFor('mig'), legacy);
    remember(['Mig']);
    localStorage.removeItem(LEGACY);
  }

  // A challenge link carries everything needed to replay the same paper.
  const challenge = unpackRun(new URLSearchParams(location.hash.slice(1)).get('dyst'));
  if (challenge) {
    state.pendingChallenge = challenge;
  }
  const active = activePerson();
  if (sessionStorage.getItem(ACTIVE_GUEST)) useProfile(null, { guest: true });
  else if (active) useProfile(active);
  else showWho();
  renderWelcomeJourney();
  if (state.run || (state.profile && navigation.entered())) {
    $('welcome').hidden = true;
    navigation.update();
  } else scenes.show('path');
  $('boot').hidden = true;
}

/* ---------- wiring ---------- */
function begin() {
  if (!state.guide) return;
  resumeJourney();
}

$('beginBtn').addEventListener('click', begin);
$('roster').addEventListener('click', (e) => {
  const btn = e.target.closest('.char');
  if (btn) choose(btn.dataset.id);
});
$('changeGuide').addEventListener('click', () => go('viewShore', 'shore'));
$('learningPath').addEventListener('click', showHalls);
function openMode(id) {
  const mode = MODES.find((item) => item.id === id);
  if (!mode) return;
  // Tinget teaches before it tests. The values questions barely repeat between
  // papers (46 unique out of 50 asked), so drilling the old ones trains for a
  // question that will not be asked. The principles behind them do repeat.
  if (mode.teaches === 'time') return showTime();
  if (mode.teaches) return showTing();
  if (mode.duel) return showArena();
  start(mode.id);
}

$('modes').addEventListener('click', (e) => {
  const btn = e.target.closest('.mode');
  if (!btn) return;
  if (btn.dataset.id === 'review') return start(null, reviewMode());
  if (btn.dataset.id === 'stories') return showStories();
  if (btn.dataset.id === 'sagaer') return reading.showIndex();
  if (btn.dataset.id === 'training') return showTraining();
  if (btn.dataset.id === 'alting') assemblyDoor = showPath;
  openMode(btn.dataset.id);
});
reading = createReading({
  state,
  $,
  usable,
  halls: HALLS,
  icon: ICON,
  materialLink,
  materialSource,
  go,
  retryHall: (hall) => start(null, hallMode(hall, HALLS.findIndex((item) => item.chapter === hall.chapter))),
});
halls = createHalls({ state, $, usable, weighted, topicIcon, topicLabel, icon: ICON, reading, go });
const storyDeck = storyView.deck(
  $('storyList'),
  (storyId) => {
    const story = state.stories.find((item) => item.id === storyId);
    if (story) showStory(story);
  },
  (message) => { $('storyDeckStatus').textContent = message; },
);
navigation = createNavigation({
  welcome: $('welcome'),
  edgeNav: $('edgeNav'),
  backButton: $('edgeBack'),
  forwardButton: $('edgeForward'),
  routeKey,
  getView: () => {
    const view = document.querySelector('.view:not([hidden])')?.id;
    return RESTORABLE_VIEWS.has(view) ? view : null;
  },
  isBlocked: () => Boolean(state.run),
  restore: restoreRoute,
  ignoreSwipe: (target) => Boolean(target.closest?.('.story-list,.map,.quiz,input,textarea,select')),
});
$('storyQuiz').addEventListener('click', () => {
  if (currentStory) start(null, storyMode(currentStory));
});
$('trainingModes').addEventListener('click', (e) => {
  const btn = e.target.closest('.mode');
  if (btn) {
    if (btn.dataset.id === 'ting') assemblyDoor = showTraining;
    openMode(btn.dataset.id);
  }
});
/* Opening a settlement folds whichever was open, and when that one sat higher up
   the page everything below it slides up — including the panel just opened. Left
   alone that is an 828px jump on a 806px screen, so the thing you asked to read
   leaves the top of the window as it opens. The browser owns the folding, so the
   correction has to live here. Only when it has actually gone above the top: a
   panel still in view is better left where it is than scrolled at.

   `toggle` does not bubble, hence the capture. The clearance under the sticky
   HUD is CSS's `scroll-margin-top`, not arithmetic. */
$('places').addEventListener('toggle', (e) => {
  const panel = e.target;
  if (!panel.open || !panel.closest?.('.place')) return;
  if (panel.getBoundingClientRect().top < 0) {
    panel.closest('.place').scrollIntoView({
      block: 'start',
      behavior: scenes.still.matches ? 'auto' : 'smooth',
    });
  }
}, true);

$('sagaHalls').addEventListener('click', (e) => {
  const read = e.target.closest('[data-read]');
  if (read) {
    return reading.showHall(HALLS[Number(read.dataset.read)], null, reading.showIndex);
  }
});

$('toMap').addEventListener('click', showMap);
$('toHalls').addEventListener('click', showHalls);
$('mapOut').addEventListener('click', () => saga.zoomBy(.8));
$('mapReset').addEventListener('click', () => saga.resetView());
$('mapIn').addEventListener('click', () => saga.zoomBy(1.25));
$('halls').addEventListener('click', (e) => {
  const read = e.target.closest('[data-read]');
  if (read) {
    return reading.showHall(HALLS[Number(read.dataset.read)], null, showHalls);
  }
  const btn = e.target.closest('.body:not([disabled])');
  if (!btn) return;
  const i = Number(btn.dataset.i);
  start(null, hallMode(HALLS[i], i));
});
$('principles').addEventListener('click', (e) => {
  const practice = e.target.closest('[data-practice]');
  if (practice) {
    const p = state.principles.find((x) => x.id === practice.dataset.practice);
    return start(null, principleMode(p));
  }
  const card = e.target.closest('.principle');
  if (card) togglePrinciple(card);
});
$('tingTest').addEventListener('click', () => start('ting'));
$('bjornDuel').addEventListener('click', () => {
  const mode = MODES.find((item) => item.id === 'dyst');
  const seed = Date.now() >>> 0;
  start(mode.id, mode, houseGhost(seed));
});
$('friendDuel').addEventListener('click', () => start('dyst'));
$('eras').addEventListener('click', (e) => {
  const btn = e.target.closest('.body:not([disabled])');
  if (btn) start(null, eraMode(state.eras[Number(btn.dataset.i)]));
});
$('quizNext').addEventListener('click', next);
const hasActiveAnswers = () => state.run?.marks.some((mark) => mark !== null);
const abandonRun = () => {
  if (hasActiveAnswers() && !confirm('Forlad denne omgang? Resultatet for den ufærdige omgang bliver ikke gemt.')) return false;
  clearRun();
  state.run = null;
  return true;
};
const exitRun = () => {
  const mode = state.run?.mode;
  if (!abandonRun()) return;
  if (mode) return leave(mode);
  if (!$('viewResult').hidden && resultMode) return leave(resultMode);
  if (!$('viewStory').hidden) return showStories();
  if (!$('viewStories').hidden) return showPath();
  if (!$('viewSagas').hidden) return reading.back();
  if (!$('viewSagaer').hidden) { renderPath(); return go('viewPath', 'path'); }
  if (!$('viewTing').hidden) return assemblyDoor();
  if (!$('viewTime').hidden) return showTraining();
  renderPath();
  go('viewPath', 'path');
};
$('quizExit').addEventListener('click', exitRun);
$('hudBack').addEventListener('click', () => {
  const view = document.querySelector('.view:not([hidden])')?.id;
  if (!state.run && RESTORABLE_VIEWS.has(view) && navigation.canBack()) navigation.back();
  else exitRun();
});
$('soundToggle').addEventListener('click', (e) => {
  state.sound = !state.sound;
  e.currentTarget.textContent = state.sound ? 'Lyd: til' : 'Lyd: fra';
  e.currentTarget.setAttribute('aria-pressed', String(state.sound));
  save();
  sfx.toggle();
});
$('resetBtn').addEventListener('click', () => {
  if (!state.profile) return;
  const who = state.profile?.name ?? '';
  if (!confirm(`Nulstil al fremgang for ${who}?`)) return;
  clearRun();
  store().removeItem(state.profile.key);
  location.reload();
});
$('switchBtn').addEventListener('click', () => {
  if (!abandonRun()) return;
  sessionStorage.removeItem(ACTIVE_GUEST);
  showWho();
});

$('profiles').addEventListener('click', (e) => {
  const drop = e.target.closest('[data-drop]');
  if (drop) {
    e.stopPropagation();
    const name = drop.dataset.drop;
    if (!confirm(`Fjern ${name} og al fremgang på denne enhed?`)) return;
    remember(people().filter((n) => n !== name));
    localStorage.removeItem(keyFor(slugify(name)));
    if (localStorage.getItem(ACTIVE_PROFILE) === slugify(name)) localStorage.removeItem(ACTIVE_PROFILE);
    renderPeople();
    ($('profiles').querySelector('.profile') ?? $('profileName')).focus();
    return;
  }
  const card = e.target.closest('.profile');
  if (card) useProfile(card.dataset.name);
});

$('newProfile').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('profileName');
  const name = input.value.trim();
  if (!name) return;
  if (!slugify(name)) {
    input.setCustomValidity('Brug mindst ét bogstav eller tal.');
    input.reportValidity();
    return;
  }
  input.setCustomValidity('');
  const list = people();
  // Same name twice would share one record, which is the bug we are fixing.
  const existing = list.find((item) => slugify(item) === slugify(name));
  if (!existing) remember([...list, name]);
  input.value = '';
  useProfile(existing ?? name);
});
$('profileName').addEventListener('input', (e) => e.currentTarget.setCustomValidity(''));

$('guestBtn').addEventListener('click', () => {
  useProfile(null, { guest: true });
});

addEventListener('beforeunload', (event) => {
  if (!hasActiveAnswers()) return;
  event.preventDefault();
  event.returnValue = '';
});

function enterApp() {
  navigation.enter();
  const welcome = $('welcome');
  welcome.classList.add('leaving');
  setTimeout(() => {
    welcome.hidden = true;
    resumeJourney();
  }, scenes.still.matches ? 0 : 450);
}
$('welcomeStart').addEventListener('click', () => {
  enterApp();
});
$('welcomeHome').addEventListener('click', (event) => {
  event.preventDefault();
  enterApp();
});
$('welcomeNavStart').addEventListener('click', enterApp);
$('welcomeSwitch').addEventListener('click', () => {
  navigation.enter();
  $('welcome').hidden = true;
  showWho();
});
$('welcomeExam').addEventListener('click', () => {
  if ((state.cleared ?? 0) >= HALLS.length) {
    welcomeMode = null;
    welcomeHall = halls.masteryHall();
  } else {
    welcomeMode = 'alting';
    assemblyDoor = showPath;
  }
  enterApp();
});
$('welcome').addEventListener('click', (e) => {
  const hall = e.target.closest('[data-welcome-hall]');
  if (!hall || hall.disabled) return;
  welcomeHall = Number(hall.dataset.welcomeHall);
  enterApp();
});

main().catch((err) => {
  $('boot').innerHTML = `<p>Kunne ikke hente det kontrollerede indhold.<br><small>${err}</small></p>
    <button class="btn primary" id="retryLoad" type="button">Prøv igen</button>`;
  $('retryLoad').onclick = () => location.reload();
});
