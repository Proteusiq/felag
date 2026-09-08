const ROSTER = 'felag.people';
export const ACTIVE_PROFILE = 'felag.active';
export const ACTIVE_GUEST = 'felag.activeGuest';

export const keyFor = (slug) => `felag.v1.${slug}`;
export const slugify = (name) =>
  name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9æøå-]/g, '').slice(0, 32);

export const storage = (profile) => (profile?.guest ? sessionStorage : localStorage);

export function people() {
  try { return JSON.parse(localStorage.getItem(ROSTER) ?? '[]'); }
  catch { return []; }
}

export function remember(list) {
  try { localStorage.setItem(ROSTER, JSON.stringify(list)); }
  catch { /* blocked storage: the current session still works */ }
}

export function activePerson() {
  const slug = localStorage.getItem(ACTIVE_PROFILE);
  return people().find((name) => slugify(name) === slug) ?? null;
}
