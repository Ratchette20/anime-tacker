const FIREBASE_API_KEY = "AIzaSyCNTOWxHmQ7jlskBYXTUpw6VIUX1IVIfHA";
const FIREBASE_PROJECT = "anime-tracker-1894a";
const FS               = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents`;
const AUTH_URL         = "https://identitytoolkit.googleapis.com/v1/accounts";

function getTokenEntry(uid) {
  return new Promise(r => {
    chrome.storage.local.get(['authTokens','authUser','authToken'], res => {
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

function saveToken(user, token) {
  chrome.storage.local.get(['authTokens'], res => {
    const t = res.authTokens || {};
    t[user.uid] = { user, token };
    chrome.storage.local.set({ authTokens: t, currentUser: user });
  });
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

async function fetchUrlSite() {
  try {
    const res = await fetch(`${FS}/url_site?key=${FIREBASE_API_KEY}`);
    if (!res.ok) return null;
    const docs = (await res.json()).documents || [];
    const result = {};
    for (const doc of docs) {
      const name = doc.name.split('/').pop();
      const f    = doc.fields || {};
      result[name] = { domain: f.domain?.stringValue || null };
    }
    return result;
  } catch(e) { return null; }
}

async function applyUrlSiteRules(siteMap) {
  if (!siteMap) return;
  const rules = [];
  let ruleId = 100;
  for (const [site, data] of Object.entries(siteMap)) {
    if (site === 'anime-sama' && data.domain) {
      const domain        = data.domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
      const escapedDomain = domain.replace(/\./g, '\\.');
      rules.push({
        id: ruleId++, priority: 10,
        action: { type: 'allow' },
        condition: { regexFilter: `^https?:\\/\\/(www\\.)?${escapedDomain}(\\/.*)?$`, resourceTypes: ['main_frame'] }
      });
      rules.push({
        id: ruleId++, priority: 8,
        action: { type: 'redirect', redirect: { regexSubstitution: `https://${domain}\\2` } },
        condition: { regexFilter: `^https?:\\/\\/(www\\.)?anime-sama\\.[^\\/]+(\\/.*)$`, resourceTypes: ['main_frame'] }
      });
    }
  }
  try {
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: existing.map(r => r.id), addRules: rules });
    console.log('[BG] Règles dynamiques mises à jour:', JSON.stringify(siteMap));
  } catch(e) { console.warn('[BG] Dynamic rules error:', e.message); }
}

function titleToKey(title, season) {
  const base = (title||'').toLowerCase().trim().replace(/\s+/g,'_').replace(/[^\w]/g,'').slice(0,100);
  return season && season > 1 ? `${base}_s${season}` : base;
}

async function getDbImage(title, season = 1) {
  if (!title) return null;
  const key = titleToKey(title, season);
  const ck  = `_imgcache_${key}`;
  const cached = await new Promise(r => chrome.storage.local.get([ck], res => r(res[ck])));
  if (cached && Date.now() - cached.ts < 600000) return cached.image || null;
  try {
    const res   = await fetch(`${FS}/image_globale/${key}?key=${FIREBASE_API_KEY}`);
    const image = res.ok ? ((await res.json()).fields?.image?.stringValue || null) : null;
    chrome.storage.local.set({ [ck]: { image: image || null, ts: Date.now() } });
    return image || null;
  } catch(e) { return null; }
}

async function requestDbImage(title, season, currentImage) {
  if (!title) return;
  const key  = titleToKey(title, season);
  const path = `${FS}/image_globale/${key}`;
  try {
    const check = await fetch(`${path}?key=${FIREBASE_API_KEY}`);
    if (check.ok) {
      const f = (await check.json()).fields || {};
      if (f.image?.stringValue) return;
      const count = parseInt(f.requestCount?.integerValue || 0, 10) + 1;
      await fetch(`${path}?key=${FIREBASE_API_KEY}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { title:{stringValue:title}, season:{integerValue:String(season)}, image:{stringValue:''}, currentImage:{stringValue:currentImage||''}, requestCount:{integerValue:String(count)}, lastRequestAt:{integerValue:String(Date.now())} }})
      });
    } else {
      await fetch(`${path}?key=${FIREBASE_API_KEY}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { title:{stringValue:title}, season:{integerValue:String(season)}, image:{stringValue:''}, currentImage:{stringValue:currentImage||''}, requestCount:{integerValue:'1'}, requestedAt:{integerValue:String(Date.now())}, lastRequestAt:{integerValue:String(Date.now())} }})
      });
    }
  } catch(e) {}
}

async function autoUploadAnimeSamaImage(title, season, image) {
  if (!title || !image) return;
  const lowerImg = image.toLowerCase();
  if (lowerImg.includes('logo') || lowerImg.includes('favicon') || lowerImg.includes('placeholder')) return;
  const key  = titleToKey(title, season);
  const path = `${FS}/image_globale/${key}`;
  try {
    const check = await fetch(`${path}?key=${FIREBASE_API_KEY}`);
    if (check.ok) {
      const existing = (await check.json()).fields?.image?.stringValue || '';
      if (existing) return;
    }
    await fetch(`${path}?key=${FIREBASE_API_KEY}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: {
        title:       { stringValue: title },
        season:      { integerValue: String(season) },
        image:       { stringValue: image },
        autoSource:  { stringValue: 'anime-sama' },
        uploadedAt:  { integerValue: String(Date.now()) }
      }})
    });
    chrome.storage.local.remove([`_imgcache_${key}`]);
    console.log(`[BG] Image Anime-Sama uploadée: "${title}"`);
  } catch(e) {}
}

async function reportImageDb(title, season, currentImage) {
  if (!title) return { success: false };
  const key  = titleToKey(title, season);
  const path = `${FS}/image_globale/${key}`;
  try {
    const check = await fetch(`${path}?key=${FIREBASE_API_KEY}`);
    let count = 1;
    if (check.ok) count = parseInt((await check.json()).fields?.requestCount?.integerValue || 0, 10) + 1;
    await fetch(`${path}?key=${FIREBASE_API_KEY}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { title:{stringValue:title}, season:{integerValue:String(season)}, image:{stringValue:''}, currentImage:{stringValue:currentImage||''}, requestCount:{integerValue:String(count)}, reported:{booleanValue:true}, lastRequestAt:{integerValue:String(Date.now())} }})
    });
    chrome.storage.local.remove([`_imgcache_${key}`]);
    return { success: true };
  } catch(e) { return { success: false, error: e.message }; }
}

async function reportIssue(title, season, details) {
  const key = `${titleToKey(title, season)}_${Date.now()}`;
  try {
    await fetch(`${FS}/issue_reports/${key}?key=${FIREBASE_API_KEY}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { title:{stringValue:title}, season:{integerValue:String(season)}, details:{stringValue:details||''}, reportedAt:{integerValue:String(Date.now())} }})
    });
    return { success: true };
  } catch(e) { return { success: false, error: e.message }; }
}

async function firebaseLogin(email, password) {
  const res = await fetch(`${AUTH_URL}:signInWithPassword?key=${FIREBASE_API_KEY}`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ email, password, returnSecureToken:true })
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error?.message || 'Erreur login');
  const user = { uid:d.localId, email:d.email, displayName:d.displayName||'' };
  saveToken(user, d.idToken);
  return { success:true, user, token:d.idToken };
}

async function firebaseRegister(email, password, displayName) {
  const res = await fetch(`${AUTH_URL}:signUp?key=${FIREBASE_API_KEY}`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ email, password, displayName:displayName||'', returnSecureToken:true })
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error?.message || 'Erreur inscription');
  const user = { uid:d.localId, email:d.email, displayName:displayName||'' };
  saveToken(user, d.idToken);
  return { success:true, user, token:d.idToken };
}

async function firebaseResetPassword(email) {
  const res = await fetch(`${AUTH_URL}:sendOobCode?key=${FIREBASE_API_KEY}`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ requestType:'PASSWORD_RESET', email })
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error?.message || 'Erreur reset');
  return { success:true };
}

async function saveAnimeFirebase(data, uid, token) {
  const docId = encodeURIComponent((data.title||'').trim().replace(/\s+/g,'_').slice(0,200));
  const lang  = data.lang || 'default';
  const path  = `${FS}/users_anime/${uid}/animes/${docId}`;
  let existing = {};
  try {
    const r = await fetch(`${path}?key=${FIREBASE_API_KEY}`, { headers:{'Authorization':`Bearer ${token}`} });
    if (r.ok) existing = (await r.json()).fields || {};
  } catch(e) {}
  const fields = {
    ...existing,
    title:      { stringValue:  data.title||'' },
    image:      { stringValue:  data.image||'' },
    sourceSite: { stringValue:  data.sourceSite||'' },
    lastSeen:   { integerValue: String(Date.now()) },
    isFilm:     { booleanValue: data.isFilm||false },
    [`ep_${lang}_episode`]:  { integerValue: String(data.episode??0) },
    [`ep_${lang}_season`]:   { integerValue: String(data.season??1) },
    [`ep_${lang}_url`]:      { stringValue:  data.url||'' },
    [`ep_${lang}_lastSeen`]: { integerValue: String(Date.now()) }
  };
  if (data.totalEpisodes!=null) fields.totalEpisodes = { integerValue:String(data.totalEpisodes) };
  if (data.isFilm&&data.filmTitle) fields.filmTitle = { stringValue:data.filmTitle };
  const res = await fetch(`${path}?key=${FIREBASE_API_KEY}`, {
    method:'PATCH', headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json'},
    body: JSON.stringify({ fields })
  });
  if (!res.ok) { const e=await res.json(); throw new Error(e.error?.message||'Firestore error'); }
}

async function updateImageInFirebase(uid, token, docTitle, image) {
  const docId = encodeURIComponent(docTitle.trim().replace(/\s+/g,'_').slice(0,200));
  try {
    await fetch(`${FS}/users_anime/${uid}/animes/${docId}?updateMask.fieldPaths=image&key=${FIREBASE_API_KEY}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { image: { stringValue: image } } })
    });
  } catch(e) {}
}

async function syncFromFirebase(uid, token) {
  const imageGlobaleMap = {};
  try {
    const imgRes = await fetch(`${FS}/image_globale?key=${FIREBASE_API_KEY}`);
    if (imgRes.ok) {
      for (const doc of ((await imgRes.json()).documents || [])) {
        const key = doc.name.split('/').pop();
        const img = doc.fields?.image?.stringValue || '';
        if (img) imageGlobaleMap[key] = img;
      }
    }
  } catch(e) {}

  const res = await fetch(`${FS}/users_anime/${uid}/animes?key=${FIREBASE_API_KEY}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) throw new Error('Erreur sync Firebase');
  const docs = (await res.json()).documents || [];

  const itemsKey  = `items_${uid}`;
  const localData = await new Promise(r => chrome.storage.local.get([itemsKey], res => r(res[itemsKey]||{})));
  const firebaseTitles = new Set();
  const newData = {};

  for (const doc of docs) {
    const f = doc.fields; if (!f) continue;
    const title = f.title?.stringValue; if (!title) continue;
    firebaseTitles.add(title);
    const existing = localData[title] || {};
    const episodes = existing.episodes || {};
    for (const [k, v] of Object.entries(f)) {
      const m = k.match(/^ep_(.+)_episode$/); if (!m) continue;
      const lang = m[1];
      const ep   = parseInt(v.integerValue||0,10);
      const seas = parseInt(f[`ep_${lang}_season`]?.integerValue||1,10);
      const url  = f[`ep_${lang}_url`]?.stringValue||'';
      const ls   = parseInt(f[`ep_${lang}_lastSeen`]?.integerValue||0,10);
      const film = f.isFilm?.booleanValue||false;
      if (!episodes[lang]||ep>(episodes[lang].episode||0)||ls>(episodes[lang].lastSeen||0))
        episodes[lang] = { episode:ep, season:seas, url, lastSeen:ls, isFilm:film };
    }
    const season       = Object.values(episodes)[0]?.season || 1;
    const imgKey       = titleToKey(title, season);
    const globaleImage = imageGlobaleMap[imgKey] || '';
    const fbImage      = f.image?.stringValue || '';
    const localImage   = existing.image || '';
    const finalImage   = globaleImage || fbImage || localImage;
    if (globaleImage && globaleImage !== fbImage) updateImageInFirebase(uid, token, title, globaleImage).catch(()=>{});
    if (finalImage && finalImage !== localImage) chrome.storage.local.remove([`_imgcache_${imgKey}`]);
    newData[title] = {
      title, image: finalImage,
      sourceSite:   f.sourceSite?.stringValue||existing.sourceSite||'',
      lastSeen:     parseInt(f.lastSeen?.integerValue||0,10)||existing.lastSeen||0,
      isFilm:       f.isFilm?.booleanValue||false,
      episodes,
      totalEpisodes: f.totalEpisodes ? parseInt(f.totalEpisodes.integerValue||0,10)||null : existing.totalEpisodes||null
    };
  }

  if (firebaseTitles.size === 0) Object.assign(newData, localData);
  await new Promise(r => chrome.storage.local.set({ [itemsKey]: newData }, r));
  console.log(`[BG] Sync: ${docs.length} animes, ${Object.keys(imageGlobaleMap).length} images globales`);
  return newData;
}

async function saveAnimeLocal(data) {
  return new Promise(resolve => {
    chrome.storage.local.get(['currentUser'], u => {
      const itemsKey = u.currentUser ? `items_${u.currentUser.uid}` : 'items';
      chrome.storage.local.get([itemsKey], res => {
        const items  = res[itemsKey] || {};
        const isFilm = !!data.isFilm;
        const season = data.season!=null ? Number(data.season) : null;
        const key    = isFilm
          ? `${(data.title||'').trim()} — ${data.filmTitle||'Film'}`
          : season&&season>1 ? `${(data.title||'').trim()} S${season}` : (data.title||'').trim();
        if (!key) return resolve({ error:'no key' });
        const prev    = items[key];
        const newEp   = data.episode!=null ? Number(data.episode) : undefined;
        const lang    = data.lang || 'default';
        const eps     = prev?.episodes || {};
        const prevD   = eps[lang];
        const better  = newEp!==undefined && newEp>(prevD?.episode||0);
        const prevTotal = prev?.totalEpisodes||null;
        const newTotal  = data.totalEpisodes!=null ? Number(data.totalEpisodes) : null;
        const total     = newTotal!==null ? (prevTotal!==null ? Math.max(newTotal,prevTotal) : newTotal) : prevTotal;
        if (!prevD || better) {
          eps[lang] = { season:season??(prevD?.season??1), episode:newEp??(prevD?.episode??0), isFilm, filmTitle:data.filmTitle||null, lastSeen:Date.now(), url:data.url };
          items[key] = { title:key, image:data.image||prev?.image, episodes:eps, sourceSite:data.sourceSite||prev?.sourceSite, isFilm, lastSeen:Date.now(), totalEpisodes:total };
          const upd={}; upd[itemsKey]=items;
          chrome.storage.local.set(upd, () => resolve({ saved:true, key }));
        } else {
          if (total!==prevTotal&&prev) { items[key]={...prev,totalEpisodes:total}; const upd={}; upd[itemsKey]=items; chrome.storage.local.set(upd); }
          if (prevD) { prevD.lastSeen=Date.now(); const upd={}; upd[itemsKey]=items; chrome.storage.local.set(upd, ()=>resolve({ updated:true, key })); }
          else resolve({ skipped:true });
        }
      });
    });
  });
}

async function onStartup() {
  const siteMap = await fetchUrlSite();
  if (siteMap) await applyUrlSiteRules(siteMap);
}

chrome.runtime.onInstalled.addListener(onStartup);
chrome.runtime.onStartup.addListener(onStartup);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'save-anime') {
    saveAnimeLocal(msg.data).then(async result => {
      const { user, token } = await getCurrentAuth();
      if (user?.uid && token) saveAnimeFirebase(msg.data, user.uid, token).catch(()=>{});
      if (msg.data.sourceSite === 'anime-sama' && msg.data.image)
        autoUploadAnimeSamaImage(msg.data.title, msg.data.season || 1, msg.data.image).catch(()=>{});
      sendResponse(result);
    });
    return true;
  }
  if (msg.type === 'get-items') {
    chrome.storage.local.get(['currentUser'], u => {
      const k = u.currentUser ? `items_${u.currentUser.uid}` : 'items';
      chrome.storage.local.get([k], r => sendResponse(r[k]||{}));
    });
    return true;
  }
  if (msg.type === 'get-db-image')     { getDbImage(msg.title, msg.season||1).then(image => sendResponse({ image })); return true; }
  if (msg.type === 'request-db-image') { requestDbImage(msg.title, msg.season||1, msg.currentImage).then(()=>sendResponse({ ok:true })); return true; }
  if (msg.type === 'report-image')     { reportImageDb(msg.title, msg.season||1, msg.currentImage).then(sendResponse); return true; }
  if (msg.type === 'report-issue')     { reportIssue(msg.title, msg.season||1, msg.details).then(sendResponse); return true; }
  if (msg.type === 'focus-or-open') {
    chrome.tabs.query({}, tabs => {
      const found = tabs.find(t => t.url?.split('#')[0]===msg.url.split('#')[0]);
      if (found) { chrome.tabs.update(found.id,{active:true}); chrome.windows.update(found.windowId,{focused:true},()=>sendResponse({focused:true})); }
      else chrome.tabs.create({url:msg.url},t=>sendResponse({opened:true,id:t.id}));
    });
    return true;
  }
  if (msg.type === 'firebase-login') {
    firebaseLogin(msg.email, msg.password).then(async result => {
      if (result.success) { try { await syncFromFirebase(result.user.uid, result.token); } catch(e) {} }
      sendResponse(result);
    }).catch(e => sendResponse({ success:false, error:e.message }));
    return true;
  }
  if (msg.type === 'firebase-register') {
    firebaseRegister(msg.email, msg.password, msg.displayName).then(sendResponse).catch(e=>sendResponse({ success:false, error:e.message }));
    return true;
  }
  if (msg.type === 'firebase-logout') {
    chrome.storage.local.get(['authTokens'], res => {
      const t = res.authTokens||{};
      if (msg.uid&&t[msg.uid]) { delete t[msg.uid]; chrome.storage.local.set({ authTokens:t }); }
    });
    sendResponse({ ok:true }); return true;
  }
  if (msg.type === 'firebase-reset-password') {
    firebaseResetPassword(msg.email).then(sendResponse).catch(e=>sendResponse({ success:false, error:e.message }));
    return true;
  }
  if (msg.type === 'sync-from-db') {
    getCurrentAuth().then(async ({ user, token }) => {
      if (!user?.uid||!token) return sendResponse({ success:false, error:'Non authentifié' });
      try { await syncFromFirebase(user.uid, token); sendResponse({ success:true }); }
      catch(e) { sendResponse({ success:false, error:e.message }); }
    });
    return true;
  }
  if (msg.type === 'refresh-url-site') {
    fetchUrlSite().then(async siteMap => { if (siteMap) await applyUrlSiteRules(siteMap); sendResponse({ ok:true }); });
    return true;
  }
});
