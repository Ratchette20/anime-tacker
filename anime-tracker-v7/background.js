// Anime Tracker — background v8
// Structure Firestore :
//   users_anime/{uid}                       → profil (displayName, email)
//   users_anime/{uid}/animes/{animeKey}     → 1 document par animé+saison (ou par film)
//   image_globale/{titleKey}                → images corrigées (partagées)
//   issue_reports/{id}                      → signalements
//   url_site/{site}                         → domaine actif des sites
// animeKey : "overlord", "overlord_s2", "overlord__film_1"

const FIREBASE_API_KEY = "AIzaSyCNTOWxHmQ7jlskBYXTUpw6VIUX1IVIfHA";
const FIREBASE_PROJECT = "anime-tracker-1894a";
const FS        = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents`;
const AUTH_URL  = "https://identitytoolkit.googleapis.com/v1/accounts";
const TOKEN_URL = "https://securetoken.googleapis.com/v1/token";
const SCHEMA_VERSION = 2;
const SYNC_EVERY_MS  = 30 * 60 * 1000;

/* ───────────── Utilitaires ───────────── */

let _chain = Promise.resolve();
const locked = fn => { const p = _chain.then(fn, fn); _chain = p.catch(() => {}); return p; };

const withKey = url => `${url}${url.includes('?') ? '&' : '?'}key=${FIREBASE_API_KEY}`;

function hashStr(s) { let h = 5381; for (const c of s) h = ((h << 5) + h + c.charCodeAt(0)) | 0; return Math.abs(h).toString(36); }

// Clé des images globales (inchangée pour rester compatible avec l'existant)
function titleToKey(title, season) {
  const raw  = (title || '').toLowerCase().trim();
  let base = raw.replace(/\s+/g, '_').replace(/[^\w]/g, '').slice(0, 100);
  if (!base && raw) base = 't' + hashStr(raw);
  return season && season > 1 ? `${base}_s${season}` : base;
}

// Clé des animés d'un utilisateur (sans accents, insensible à la casse)
function slug(s) {
  const raw = (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  let b = raw.replace(/\s+/g, '_').replace(/[^\w]/g, '').slice(0, 100);
  if (!b && raw) b = 't' + hashStr(raw);
  return b;
}

function animeKey(meta) {
  const b = slug(meta.baseTitle);
  if (!b) return '';
  if (meta.isFilm) return `${b}__${slug(meta.filmTitle) || 'film'}`;
  return meta.season > 1 ? `${b}_s${meta.season}` : b;
}

function metaFromData(data) {
  if (data.isFilm) {
    const base = (data.animeTitle || (data.title || '').split(' — ')[0]).trim();
    return { baseTitle: base, season: null, isFilm: true, filmTitle: (data.filmTitle || 'Film').trim() };
  }
  return { baseTitle: (data.title || '').trim(), season: Number(data.season) || 1, isFilm: false, filmTitle: null };
}

const maxEp = eps => Math.max(0, ...Object.values(eps || {}).map(d => d.episode || 0));
const imageKeyTitle  = r => r.isFilm ? `${r.baseTitle} — ${r.filmTitle || 'Film'}` : r.baseTitle;
const imageKeySeason = r => r.isFilm ? 1 : (r.season || 1);

/* ───────────── Fusion / migration ───────────── */

function mergeRecords(a, b, { imageFrom = 'a' } = {}) {
  if (!a) return b;
  if (!b) return a;
  const episodes = { ...(a.episodes || {}) };
  for (const [lang, d] of Object.entries(b.episodes || {})) {
    const x = episodes[lang];
    const de = d.episode || 0, xe = x?.episode || 0;
    if (!x || de > xe || (de === xe && (d.lastSeen || 0) > (x.lastSeen || 0))) episodes[lang] = { ...(x || {}), ...d };
    else episodes[lang] = { ...x, lastSeen: Math.max(x.lastSeen || 0, d.lastSeen || 0) };
  }
  const newer  = (b.lastSeen || 0) > (a.lastSeen || 0) ? b : a;
  const totals = [a.totalEpisodes, b.totalEpisodes].filter(t => t != null);
  const imgs   = imageFrom === 'b' ? [b.image, a.image] : [a.image, b.image];
  return {
    ...a,
    title: newer.baseTitle || a.baseTitle, baseTitle: newer.baseTitle || a.baseTitle,
    filmTitle: a.filmTitle || b.filmTitle || null,
    image: imgs.find(Boolean) || '',
    sourceSite: newer.sourceSite || a.sourceSite || b.sourceSite || '',
    lastSeen: Math.max(a.lastSeen || 0, b.lastSeen || 0),
    totalEpisodes: totals.length ? Math.max(...totals) : null,
    episodes
  };
}

function parseLegacy(key, it) {
  if (it.isFilm || key.includes(' — ')) {
    const [b, ...rest] = key.split(' — ');
    const ft = Object.values(it.episodes || {}).find(e => e.filmTitle)?.filmTitle || rest[0] || 'Film';
    return { baseTitle: b.trim(), season: null, isFilm: true, filmTitle: ft };
  }
  const m = key.match(/^(.*?)\s+S(\d+)$/);
  if (m && Number(m[2]) > 1) return { baseTitle: m[1].trim(), season: Number(m[2]), isFilm: false, filmTitle: null };
  return { baseTitle: key.trim(), season: 1, isFilm: false, filmTitle: null };
}

// Idempotent : convertit les anciennes clés locales ("Titre S2", "X — Film 1 — Film 1") vers le schéma v2
function migrateLocal(items) {
  const out = {};
  for (const [k, it] of Object.entries(items || {})) {
    if (!it || typeof it !== 'object') continue;
    const meta = (it.baseTitle && it.key)
      ? { baseTitle: it.baseTitle, season: it.season ?? null, isFilm: !!it.isFilm, filmTitle: it.filmTitle || null }
      : parseLegacy(k, it);
    const key = animeKey(meta);
    if (!key) continue;
    const rec = { ...it, ...meta, title: meta.baseTitle, key, episodes: it.episodes || {}, image: it.image || '' };
    out[key] = mergeRecords(out[key], rec);
  }
  return out;
}

/* ───────────── Conversion Firestore ───────────── */

function docToRecord(doc) {
  const f = doc.fields || {};
  const docId = doc.name.split('/').pop();
  const str = k => f[k]?.stringValue || '';
  const int = (k, d = 0) => parseInt(f[k]?.integerValue ?? d, 10) || d;
  const isFilm = !!f.isFilm?.booleanValue;
  const episodes = {};
  for (const k of Object.keys(f)) {
    const m = k.match(/^ep_(.+)_episode$/);
    if (!m) continue;
    const lang = m[1];
    episodes[lang] = { episode: int(k), season: int(`ep_${lang}_season`, 1), url: str(`ep_${lang}_url`), lastSeen: int(`ep_${lang}_lastSeen`), isFilm };
  }
  const isNew = int('schemaVersion') === SCHEMA_VERSION;
  let baseTitle = str('title'), filmTitle = str('filmTitle') || null, season = null;
  if (isFilm) {
    if (!isNew) { const p = baseTitle.split(' — '); baseTitle = p[0]; filmTitle = filmTitle || p[1] || 'Film'; }
  } else {
    season = isNew ? int('season', 1) : (Object.values(episodes)[0]?.season || 1);
  }
  const meta = { baseTitle: baseTitle.trim(), season, isFilm, filmTitle };
  return {
    ...meta, key: animeKey(meta), title: meta.baseTitle, docId, legacy: !isNew,
    image: str('image'), sourceSite: str('sourceSite'), lastSeen: int('lastSeen'),
    totalEpisodes: f.totalEpisodes ? (int('totalEpisodes') || null) : null, episodes
  };
}

function recordToFields(r) {
  const f = {
    schemaVersion: { integerValue: String(SCHEMA_VERSION) },
    key:        { stringValue: r.key },
    title:      { stringValue: r.baseTitle },
    isFilm:     { booleanValue: !!r.isFilm },
    image:      { stringValue: r.image || '' },
    sourceSite: { stringValue: r.sourceSite || '' },
    lastSeen:   { integerValue: String(r.lastSeen || Date.now()) },
    maxEpisode: { integerValue: String(maxEp(r.episodes)) },
    langs:      { arrayValue: { values: Object.keys(r.episodes || {}).map(l => ({ stringValue: l })) } }
  };
  if (r.isFilm) f.filmTitle = { stringValue: r.filmTitle || 'Film' };
  else f.season = { integerValue: String(r.season || 1) };
  if (r.totalEpisodes != null) f.totalEpisodes = { integerValue: String(r.totalEpisodes) };
  for (const [lang, d] of Object.entries(r.episodes || {})) {
    f[`ep_${lang}_episode`]  = { integerValue: String(d.episode ?? 0) };
    f[`ep_${lang}_season`]   = { integerValue: String(d.season ?? r.season ?? 1) };
    f[`ep_${lang}_url`]      = { stringValue: d.url || '' };
    f[`ep_${lang}_lastSeen`] = { integerValue: String(d.lastSeen || Date.now()) };
  }
  return f;
}

/* ───────────── Auth (tokens + refresh) ───────────── */

function getTokenEntry(uid) {
  return new Promise(r => {
    chrome.storage.local.get(['authTokens', 'authUser', 'authToken'], res => {
      const t = res.authTokens || {};
      if (t[uid]) return r(t[uid]);
      if (res.authUser?.uid === uid && res.authToken) {
        t[uid] = { user: res.authUser, token: res.authToken };
        chrome.storage.local.set({ authTokens: t });
        return r(t[uid]);
      }
      r(null);
    });
  });
}

async function setTokenEntry(uid, entry) {
  const { authTokens = {} } = await chrome.storage.local.get('authTokens');
  authTokens[uid] = entry;
  await chrome.storage.local.set({ authTokens });
}

async function saveToken(user, token, refreshToken, expiresIn) {
  await setTokenEntry(user.uid, { user, token, refreshToken: refreshToken || null, expiresAt: Date.now() + Number(expiresIn || 3600) * 1000 });
  await chrome.storage.local.set({ currentUser: user });
}

async function refreshToken(uid) {
  const e = await getTokenEntry(uid);
  if (!e?.refreshToken) return null;
  try {
    const res = await fetch(`${TOKEN_URL}?key=${FIREBASE_API_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(e.refreshToken)}`
    });
    const d = await res.json();
    if (!res.ok) return null;
    const entry = { ...e, token: d.id_token, refreshToken: d.refresh_token || e.refreshToken, expiresAt: Date.now() + Number(d.expires_in || 3600) * 1000 };
    await setTokenEntry(uid, entry);
    return entry.token;
  } catch (err) { return null; }
}

async function getValidToken(uid) {
  const e = await getTokenEntry(uid);
  if (!e) return null;
  if (e.refreshToken && e.expiresAt && Date.now() > e.expiresAt - 120000) return (await refreshToken(uid)) || e.token;
  return e.token;
}

async function authFetch(uid, url, opts = {}, retry = true) {
  const token = await getValidToken(uid);
  if (!token) throw new Error('Non authentifié');
  const res = await fetch(withKey(url), {
    method: opts.method || 'GET',
    headers: { Authorization: `Bearer ${token}`, ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  if (res.status === 401 && retry) {
    const t = await refreshToken(uid);
    if (t) return authFetch(uid, url, opts, false);
    throw new Error('Session expirée, reconnectez-vous');
  }
  return res;
}

function getCurrentAuth() {
  return new Promise(r => {
    chrome.storage.local.get(['currentUser'], res => {
      const cu = res.currentUser;
      if (!cu?.uid) return r({ user: null, token: null });
      getTokenEntry(cu.uid).then(e => r({ user: cu, token: e?.token || null }));
    });
  });
}

async function ensureProfile(user) {
  try {
    await authFetch(user.uid,
      `${FS}/users_anime/${user.uid}?updateMask.fieldPaths=displayName&updateMask.fieldPaths=email&updateMask.fieldPaths=updatedAt`,
      { method: 'PATCH', body: { fields: {
        displayName: { stringValue: user.displayName || '' },
        email:       { stringValue: user.email || '' },
        updatedAt:   { integerValue: String(Date.now()) }
      } } });
  } catch (e) {}
}

async function firebaseLogin(email, password) {
  const res = await fetch(`${AUTH_URL}:signInWithPassword?key=${FIREBASE_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error?.message || 'Erreur login');
  const user = { uid: d.localId, email: d.email, displayName: d.displayName || '' };
  await saveToken(user, d.idToken, d.refreshToken, d.expiresIn);
  ensureProfile(user);
  return { success: true, user, token: d.idToken };
}

async function firebaseRegister(email, password, displayName) {
  const res = await fetch(`${AUTH_URL}:signUp?key=${FIREBASE_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, displayName: displayName || '', returnSecureToken: true })
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error?.message || 'Erreur inscription');
  const user = { uid: d.localId, email: d.email, displayName: displayName || '' };
  await saveToken(user, d.idToken, d.refreshToken, d.expiresIn);
  ensureProfile(user);
  return { success: true, user, token: d.idToken };
}

async function firebaseResetPassword(email) {
  const res = await fetch(`${AUTH_URL}:sendOobCode?key=${FIREBASE_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestType: 'PASSWORD_RESET', email })
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error?.message || 'Erreur reset');
  return { success: true };
}

/* ───────────── Redirection anime-sama ───────────── */

async function fetchUrlSite() {
  try {
    const res = await fetch(`${FS}/url_site?key=${FIREBASE_API_KEY}`);
    if (!res.ok) return null;
    const docs = (await res.json()).documents || [];
    const result = {};
    for (const doc of docs) result[doc.name.split('/').pop()] = { domain: doc.fields?.domain?.stringValue || null };
    return result;
  } catch (e) { return null; }
}

async function refreshRedirect(siteMap) {
  const { urlRedirectEnabled } = await chrome.storage.local.get('urlRedirectEnabled');
  const enabled = urlRedirectEnabled !== false;
  try {
    await chrome.declarativeNetRequest.updateEnabledRulesets(
      enabled ? { enableRulesetIds: ['ruleset_redirect'] } : { disableRulesetIds: ['ruleset_redirect'] });
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    const removeRuleIds = existing.map(r => r.id);
    const rules = [];
    if (enabled && siteMap) {
      let id = 100;
      const data = siteMap['anime-sama'];
      if (data?.domain) {
        const domain  = data.domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
        const escaped = domain.replace(/\./g, '\\.');
        rules.push({ id: id++, priority: 10, action: { type: 'allow' },
          condition: { regexFilter: `^https?:\\/\\/(www\\.)?${escaped}(\\/.*)?$`, resourceTypes: ['main_frame'] } });
        rules.push({ id: id++, priority: 8,
          action: { type: 'redirect', redirect: { regexSubstitution: `https://${domain}\\2` } },
          condition: { regexFilter: `^https?:\\/\\/(www\\.)?anime-sama\\.[^\\/]+(\\/.*)$`, resourceTypes: ['main_frame'] } });
      }
    }
    if (!enabled || siteMap) await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules: rules });
  } catch (e) { console.warn('[BG] Redirect rules error:', e.message); }
}

/* ───────────── Images globales / signalements ───────────── */

async function getDbImage(title, season = 1) {
  if (!title) return null;
  const key = titleToKey(title, season);
  if (!key) return null;
  const ck = `_imgcache_${key}`;
  const cached = await new Promise(r => chrome.storage.local.get([ck], res => r(res[ck])));
  if (cached && Date.now() - cached.ts < 600000) return cached.image || null;
  try {
    const res   = await fetch(`${FS}/image_globale/${key}?key=${FIREBASE_API_KEY}`);
    const image = res.ok ? ((await res.json()).fields?.image?.stringValue || null) : null;
    chrome.storage.local.set({ [ck]: { image: image || null, ts: Date.now() } });
    return image || null;
  } catch (e) { return null; }
}

async function requestDbImage(title, season, currentImage) {
  if (!title) return;
  const key = titleToKey(title, season);
  if (!key) return;
  const path = `${FS}/image_globale/${key}`;
  const patch = body => fetch(`${path}?key=${FIREBASE_API_KEY}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: body }) });
  try {
    const check = await fetch(`${path}?key=${FIREBASE_API_KEY}`);
    const base = { title: { stringValue: title }, season: { integerValue: String(season) }, image: { stringValue: '' }, currentImage: { stringValue: currentImage || '' }, lastRequestAt: { integerValue: String(Date.now()) } };
    if (check.ok) {
      const f = (await check.json()).fields || {};
      if (f.image?.stringValue) return;
      const count = parseInt(f.requestCount?.integerValue || 0, 10) + 1;
      await patch({ ...base, requestCount: { integerValue: String(count) } });
    } else {
      await patch({ ...base, requestCount: { integerValue: '1' }, requestedAt: { integerValue: String(Date.now()) } });
    }
  } catch (e) {}
}

async function autoUploadAnimeSamaImage(title, season, image) {
  if (!title || !image) return;
  const low = image.toLowerCase();
  if (low.includes('logo') || low.includes('favicon') || low.includes('placeholder')) return;
  const key = titleToKey(title, season);
  if (!key) return;
  const path = `${FS}/image_globale/${key}`;
  try {
    const check = await fetch(`${path}?key=${FIREBASE_API_KEY}`);
    if (check.ok && ((await check.json()).fields?.image?.stringValue || '')) return;
    await fetch(`${path}?key=${FIREBASE_API_KEY}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: {
        title: { stringValue: title }, season: { integerValue: String(season) }, image: { stringValue: image },
        autoSource: { stringValue: 'anime-sama' }, uploadedAt: { integerValue: String(Date.now()) }
      } })
    });
    chrome.storage.local.remove([`_imgcache_${key}`]);
  } catch (e) {}
}

async function reportImageDb(title, season, currentImage) {
  if (!title) return { success: false };
  const key = titleToKey(title, season);
  const path = `${FS}/image_globale/${key}`;
  try {
    const check = await fetch(`${path}?key=${FIREBASE_API_KEY}`);
    let count = 1;
    if (check.ok) count = parseInt((await check.json()).fields?.requestCount?.integerValue || 0, 10) + 1;
    await fetch(`${path}?key=${FIREBASE_API_KEY}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: {
        title: { stringValue: title }, season: { integerValue: String(season) }, image: { stringValue: '' },
        currentImage: { stringValue: currentImage || '' }, requestCount: { integerValue: String(count) },
        reported: { booleanValue: true }, lastRequestAt: { integerValue: String(Date.now()) }
      } })
    });
    chrome.storage.local.remove([`_imgcache_${key}`]);
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
}

async function reportIssue(title, season, details) {
  const key = `${titleToKey(title, season)}_${Date.now()}`;
  try {
    await fetch(`${FS}/issue_reports/${key}?key=${FIREBASE_API_KEY}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { title: { stringValue: title }, season: { integerValue: String(season) }, details: { stringValue: details || '' }, reportedAt: { integerValue: String(Date.now()) } } })
    });
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
}

/* ───────────── Sauvegarde d'un animé vu ───────────── */

async function listDocs(uid, collectionUrl) {
  const out = [];
  let pageToken = '';
  do {
    const url = `${collectionUrl}?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const r = await authFetch(uid, url);
    if (r.status === 404) break;
    if (!r.ok) throw new Error(`Erreur sync Firebase (${r.status})`);
    const j = await r.json();
    out.push(...(j.documents || []));
    pageToken = j.nextPageToken || '';
  } while (pageToken);
  return out;
}

async function writeRecord(uid, rec) {
  const r = await authFetch(uid, `${FS}/users_anime/${uid}/animes/${rec.key}`, { method: 'PATCH', body: { fields: recordToFields(rec) } });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error?.message || 'Firestore error');
}

// Fusionne avec la version distante (évite toute régression d'épisode) puis écrit
async function pushRecord(uid, rec) {
  let merged = rec;
  const r = await authFetch(uid, `${FS}/users_anime/${uid}/animes/${rec.key}`);
  if (r.ok) merged = mergeRecords(rec, docToRecord(await r.json()));
  else if (r.status !== 404) throw new Error(`Firestore ${r.status}`);
  await writeRecord(uid, merged);
  return merged;
}

function applyView(prev, data, meta, key) {
  const lang = data.lang || 'default';
  const eps  = { ...(prev?.episodes || {}) };
  const prevD = eps[lang];
  const newEp = data.episode != null ? Number(data.episode) : null;
  const now = Date.now();
  let status;
  if (!prevD || (newEp !== null && newEp > (prevD.episode || 0))) {
    eps[lang] = { season: meta.season ?? 1, episode: newEp ?? (prevD?.episode ?? 0), isFilm: meta.isFilm, filmTitle: meta.filmTitle, lastSeen: now, url: data.url };
    status = 'saved';
  } else {
    eps[lang] = { ...prevD, lastSeen: now, url: newEp === prevD.episode ? data.url : prevD.url };
    status = 'updated';
  }
  const newTotal = data.totalEpisodes != null ? Number(data.totalEpisodes) : null;
  const totals = [prev?.totalEpisodes, newTotal].filter(t => t != null);
  return {
    status,
    record: {
      ...(prev || {}), ...meta, key, title: meta.baseTitle,
      image: data.image || prev?.image || '',
      sourceSite: data.sourceSite || prev?.sourceSite || '',
      lastSeen: now, totalEpisodes: totals.length ? Math.max(...totals) : null, episodes: eps
    }
  };
}

async function saveAnime(data) {
  const { currentUser: user } = await chrome.storage.local.get('currentUser');
  const itemsKey = user?.uid ? `items_${user.uid}` : 'items';
  const meta = metaFromData(data);
  const key = animeKey(meta);
  if (!key) return { error: 'no key' };

  const { status, record } = await locked(async () => {
    const items = migrateLocal((await chrome.storage.local.get([itemsKey]))[itemsKey] || {});
    const res = applyView(items[key], data, meta, key);
    items[key] = res.record;
    await chrome.storage.local.set({ [itemsKey]: items });
    return res;
  });

  if (user?.uid && !user.isLocal) {
    try {
      const merged = await pushRecord(user.uid, record);
      if (merged !== record) {
        await locked(async () => {
          const items = (await chrome.storage.local.get([itemsKey]))[itemsKey] || {};
          items[key] = mergeRecords(items[key], merged);
          await chrome.storage.local.set({ [itemsKey]: items });
        });
      }
    } catch (e) { console.warn('[BG] Push Firebase échoué (sera renvoyé à la prochaine synchro):', e.message); }
    const { [`lastSync_${user.uid}`]: last = 0 } = await chrome.storage.local.get(`lastSync_${user.uid}`);
    if (Date.now() - last > SYNC_EVERY_MS) syncUser(user.uid).catch(() => {});
  }
  if (data.sourceSite === 'anime-sama' && data.image)
    autoUploadAnimeSamaImage(imageKeyTitle(record), imageKeySeason(record), data.image).catch(() => {});
  return { [status]: true, key };
}

/* ───────────── Synchronisation bidirectionnelle ───────────── */

const syncing = new Set();

function needsPush(local, remote, hasLegacy) {
  if (!remote || remote.legacy || hasLegacy) return true;
  for (const [lang, d] of Object.entries(local.episodes || {})) {
    const r = remote.episodes?.[lang];
    if (!r || (d.episode || 0) > (r.episode || 0)) return true;
  }
  if (local.image && local.image !== remote.image) return true;
  if ((local.totalEpisodes || 0) > (remote.totalEpisodes || 0)) return true;
  return false;
}

async function syncUser(uid) {
  if (syncing.has(uid)) return { skipped: true };
  syncing.add(uid);
  try {
    const itemsKey = `items_${uid}`;

    // 1. Lire Firebase (avec pagination)
    const docs = await listDocs(uid, `${FS}/users_anime/${uid}/animes`);
    const exact = {}, all = {}, legacyIds = {};
    for (const doc of docs) {
      const rr = docToRecord(doc);
      if (!rr.baseTitle || !rr.key) continue;
      all[rr.key] = mergeRecords(all[rr.key], rr, { imageFrom: 'b' });
      if (rr.docId === rr.key) exact[rr.key] = rr; else (legacyIds[rr.key] ||= []).push(rr.docId);
    }

    // 2. Images globales pour chaque animé connu
    const snapshot = migrateLocal((await chrome.storage.local.get([itemsKey]))[itemsKey] || {});
    const union = { ...snapshot };
    for (const rr of Object.values(all)) union[rr.key] = mergeRecords(union[rr.key], rr);
    const imgMap = {};
    const list = Object.values(union);
    for (let i = 0; i < list.length; i += 8) {
      await Promise.all(list.slice(i, i + 8).map(async r => {
        const img = await getDbImage(imageKeyTitle(r), imageKeySeason(r));
        if (img) imgMap[r.key] = img;
      }));
    }

    // 3. Fusion locale (sans jamais perdre de données locales)
    const merged = await locked(async () => {
      const items = migrateLocal((await chrome.storage.local.get([itemsKey]))[itemsKey] || {});
      for (const rr of Object.values(all)) items[rr.key] = mergeRecords(items[rr.key], rr, { imageFrom: 'b' });
      for (const [k, img] of Object.entries(imgMap)) if (items[k]) items[k].image = img;
      await chrome.storage.local.set({ [itemsKey]: items });
      return items;
    });

    // 4. Renvoyer vers Firebase ce qui manque / est en avance / est à l'ancien format
    const toPush = Object.values(merged).filter(r => needsPush(r, exact[r.key], !!legacyIds[r.key]?.length));
    let pushed = 0;
    for (let i = 0; i < toPush.length; i += 5) {
      await Promise.all(toPush.slice(i, i + 5).map(async rec => {
        try {
          await writeRecord(uid, rec);
          pushed++;
          for (const oldId of (legacyIds[rec.key] || []))
            await authFetch(uid, `${FS}/users_anime/${uid}/animes/${oldId}`, { method: 'DELETE' }).catch(() => {});
        } catch (e) { console.warn('[BG] Push échoué:', rec.key, e.message); }
      }));
    }

    await chrome.storage.local.set({ [`lastSync_${uid}`]: Date.now() });
    console.log(`[BG] Sync: ${docs.length} distants, ${Object.keys(merged).length} locaux, ${pushed} envoyés`);
    return { total: Object.keys(merged).length, pushed };
  } finally { syncing.delete(uid); }
}

async function syncCurrent() {
  const { user, token } = await getCurrentAuth();
  if (!user) return { success: false, error: 'Aucun compte' };
  if (user.isLocal || !token) {
    const itemsKey = user.uid ? `items_${user.uid}` : 'items';
    await locked(async () => {
      const items = migrateLocal((await chrome.storage.local.get([itemsKey]))[itemsKey] || {});
      await chrome.storage.local.set({ [itemsKey]: items });
    });
    return { success: true, localOnly: true };
  }
  await syncUser(user.uid);
  return { success: true };
}

/* ───────────── Démarrage & messages ───────────── */

async function onStartup() {
  const siteMap = await fetchUrlSite();
  await refreshRedirect(siteMap);
  syncCurrent().catch(() => {});
}

chrome.runtime.onInstalled.addListener(onStartup);
chrome.runtime.onStartup.addListener(onStartup);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.urlRedirectEnabled) fetchUrlSite().then(refreshRedirect);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const reply = p => { p.then(sendResponse).catch(e => sendResponse({ success: false, error: e.message })); return true; };

  switch (msg.type) {
    case 'save-anime':        return reply(saveAnime(msg.data));
    case 'get-items':
      return reply((async () => {
        const { currentUser: u } = await chrome.storage.local.get('currentUser');
        const k = u?.uid ? `items_${u.uid}` : 'items';
        return migrateLocal((await chrome.storage.local.get([k]))[k] || {});
      })());
    case 'get-db-image':      return reply(getDbImage(msg.title, msg.season || 1).then(image => ({ image })));
    case 'request-db-image':  return reply(requestDbImage(msg.title, msg.season || 1, msg.currentImage).then(() => ({ ok: true })));
    case 'report-image':      return reply(reportImageDb(msg.title, msg.season || 1, msg.currentImage));
    case 'report-issue':      return reply(reportIssue(msg.title, msg.season || 1, msg.details));
    case 'focus-or-open':
      chrome.tabs.query({}, tabs => {
        const found = tabs.find(t => t.url?.split('#')[0] === msg.url.split('#')[0]);
        if (found) { chrome.tabs.update(found.id, { active: true }); chrome.windows.update(found.windowId, { focused: true }, () => sendResponse({ focused: true })); }
        else chrome.tabs.create({ url: msg.url }, t => sendResponse({ opened: true, id: t.id }));
      });
      return true;
    case 'firebase-login':
      return reply((async () => {
        const result = await firebaseLogin(msg.email, msg.password);
        try { await syncUser(result.user.uid); } catch (e) { console.warn('[BG] Sync login:', e.message); }
        return result;
      })());
    case 'firebase-register': return reply(firebaseRegister(msg.email, msg.password, msg.displayName));
    case 'firebase-logout':
      chrome.storage.local.get(['authTokens'], res => {
        const t = res.authTokens || {};
        if (msg.uid && t[msg.uid]) { delete t[msg.uid]; chrome.storage.local.set({ authTokens: t }); }
        sendResponse({ ok: true });
      });
      return true;
    case 'firebase-reset-password': return reply(firebaseResetPassword(msg.email));
    case 'sync-from-db':      return reply(syncCurrent());
    case 'refresh-url-site':  return reply(fetchUrlSite().then(async m => { await refreshRedirect(m); return { ok: true }; }));
  }
});
