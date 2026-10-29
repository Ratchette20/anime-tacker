const PopupUI = (() => {
  const $ = id => document.getElementById(id);

  const pseudoScreen        = $('pseudoScreen');
  const loginScreen         = $('loginScreen');
  const mainScreen          = $('mainScreen');
  const pseudoInput         = $('pseudoInput');
  const pseudoBtn           = $('pseudoBtn');
  const pseudoError         = $('pseudoError');
  const pseudoExistingWrap  = $('pseudoExistingWrap');
  const pseudoAccountsList  = $('pseudoAccountsList');
  const loginForm           = $('loginForm');
  const registerForm        = $('registerForm');
  const forgotForm          = $('forgotForm');
  const loginEmail          = $('loginEmail');
  const loginPassword       = $('loginPassword');
  const loginBtn            = $('loginBtn');
  const registerEmail       = $('registerEmail');
  const registerPassword    = $('registerPassword');
  const registerDisplayName = $('registerDisplayName');
  const registerBtn         = $('registerBtn');
  const registerToggleBtn   = $('registerToggleBtn');
  const loginToggleBtn      = $('loginToggleBtn');
  const loginError          = $('loginError');
  const registerError       = $('registerError');
  const loginExistingWrap   = $('loginExistingWrap');
  const loginAccountsList   = $('loginAccountsList');
  const forgotPasswordBtn   = $('forgotPasswordBtn');
  const forgotSendBtn       = $('forgotSendBtn');
  const forgotBackBtn       = $('forgotBackBtn');
  const forgotEmail         = $('forgotEmail');
  const forgotMsg           = $('forgotMsg');
  const listEl              = $('list');
  const searchEl            = $('search');
  const sortEl              = $('sort');
  const siteBtn             = $('siteBtn');
  const profileCircle       = $('profileCircle');
  const profileImg          = $('profileImg');
  const profileModal        = $('profileModal');
  const profileCloseBtn     = $('profileCloseBtn');
  const profileDisconnectBtn= $('profileDisconnectBtn');
  const profileAddAccountBtn= $('profileAddAccountBtn');
  const profileName         = $('profileName');
  const profileEmail        = $('profileEmail');
  const profileImgLarge     = $('profileImgLarge');
  const profileAccountsList = $('profileAccountsList');
  const profileSettingsBtn  = $('profileSettingsBtn');
  const settingsPanel       = $('settingsPanel');
  const settingUrlRedirect  = $('settingUrlRedirect');
  const statAnimes          = $('statAnimes');
  const statEpisodes        = $('statEpisodes');
  const reportModal         = $('reportModal');
  const reportCloseBtn      = $('reportCloseBtn');
  const reportAnimeTitle    = $('reportAnimeTitle');
  const reportBtnImage      = $('reportBtnImage');
  const reportBtnIssue      = $('reportBtnIssue');
  const reportIssueForm     = $('reportIssueForm');
  const reportIssueDetails  = $('reportIssueDetails');
  const reportIssueSend     = $('reportIssueSend');
  const reportMsg           = $('reportMsg');

  let currentUser   = null;
  let allAccounts   = [];
  let reportingItem = null;

  function makeAvatar(displayName, size = 36) {
    const str  = displayName || 'U';
    const hash = str.split('').reduce((a,c) => ((a<<5)-a)+c.charCodeAt(0)|0, 0);
    const colors = ['#06b6d4','#8b5cf6','#10b981','#f59e0b','#ef4444','#ec4899'];
    const c = document.createElement('canvas'); c.width = c.height = size;
    const ctx = c.getContext('2d');
    ctx.fillStyle = colors[Math.abs(hash) % colors.length]; ctx.fillRect(0,0,size,size);
    ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(size*.44)}px Arial`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(str[0].toUpperCase(), size/2, size/2);
    return c.toDataURL();
  }

  const send = msg => new Promise(r => chrome.runtime.sendMessage(msg, r));

  const showPseudoScreen = () => {
    pseudoScreen.style.display = 'flex';
    loginScreen.style.display = mainScreen.style.display = 'none';
    pseudoInput.value = ''; pseudoError.textContent = '';
    const locals = allAccounts.filter(a => a.isLocal);
    pseudoExistingWrap.style.display = locals.length ? 'block' : 'none';
    if (locals.length) renderAuthList(pseudoAccountsList, locals, switchAccount);
    setTimeout(() => pseudoInput.focus(), 50);
  };

  const showLoginScreen = () => {
    loginScreen.style.display = 'flex';
    pseudoScreen.style.display = mainScreen.style.display = 'none';
    resetForms();
    const remotes = allAccounts.filter(a => !a.isLocal);
    loginExistingWrap.style.display = remotes.length ? 'block' : 'none';
    if (remotes.length) renderAuthList(loginAccountsList, remotes, switchAccount);
  };

  const showMainScreen = () => {
    mainScreen.style.display = 'block';
    pseudoScreen.style.display = loginScreen.style.display = 'none';
    refresh();
    send({ type: 'sync-from-db' }).then(() => refresh()).catch(() => {});
  };

  const switchAccount = acc => {
    currentUser = acc;
    chrome.storage.local.set({ currentUser: acc });
    showMainScreen();
  };

  function renderAuthList(container, accounts, onSelect) {
    container.innerHTML = '';
    for (const acc of accounts) {
      const row   = document.createElement('div'); row.className = 'auth-account-row';
      const av    = document.createElement('div'); av.className  = 'auth-account-avatar';
      const img   = document.createElement('img'); img.src = makeAvatar(acc.displayName, 36); av.appendChild(img);
      const info  = document.createElement('div'); info.className = 'auth-account-info';
      const name  = document.createElement('div'); name.className = 'auth-account-name'; name.textContent = acc.displayName || 'Compte'; info.appendChild(name);
      const sub   = acc.email || (acc.isLocal ? 'Compte local' : '');
      if (sub) { const s = document.createElement('div'); s.className = 'auth-account-sub'; s.textContent = sub; info.appendChild(s); }
      const arrow = document.createElement('span'); arrow.className = 'auth-account-arrow'; arrow.textContent = '›';
      row.appendChild(av); row.appendChild(info); row.appendChild(arrow);
      row.addEventListener('click', () => onSelect(acc));
      container.appendChild(row);
    }
  }

  const initAuth = async () => {
    allAccounts = await new Promise(r => chrome.storage.local.get(['accounts'], res => r(res.accounts || [])));
    if (!Config.isConnected()) {
      if (allAccounts.length) {
        const { currentUser: saved } = await new Promise(r => chrome.storage.local.get(['currentUser'], r));
        currentUser = (saved && allAccounts.find(a => a.uid === saved.uid)) ? saved : allAccounts[0];
        showMainScreen();
      } else showPseudoScreen();
    } else {
      const s = await new Promise(r => chrome.storage.local.get(['authUser','authToken','currentUser'], r));
      if (s.currentUser && allAccounts.find(a => a.uid === s.currentUser.uid)) {
        currentUser = s.currentUser; showMainScreen();
      } else if (s.authUser && s.authToken) {
        currentUser = s.authUser; storeAccount(s.authUser);
        chrome.storage.local.set({ currentUser: s.authUser }); showMainScreen();
      } else if (allAccounts.length) {
        currentUser = allAccounts[0]; chrome.storage.local.set({ currentUser: allAccounts[0] }); showMainScreen();
      } else showLoginScreen();
    }
  };

  const storeAccount = acc => {
    const i = allAccounts.findIndex(a => a.uid === acc.uid);
    if (i >= 0) allAccounts[i] = acc; else allAccounts.push(acc);
    chrome.storage.local.set({ accounts: allAccounts });
  };

  const resetForms = () => {
    loginEmail.value = loginPassword.value = loginError.textContent = '';
    registerEmail.value = registerPassword.value = registerDisplayName.value = registerError.textContent = '';
    forgotEmail.value = forgotMsg.textContent = '';
    loginForm.style.display = 'flex'; registerForm.style.display = forgotForm.style.display = 'none';
  };

  const doLogout = async () => {
    if (Config.isConnected()) await send({ type: 'firebase-logout', uid: currentUser?.uid });
    if (currentUser) { allAccounts = allAccounts.filter(a => a.uid !== currentUser.uid); chrome.storage.local.set({ accounts: allAccounts }); }
    currentUser = null; chrome.storage.local.set({ currentUser: null });
    hideProfileModal();
    Config.isConnected() ? showLoginScreen() : showPseudoScreen();
  };

  const fetchItems = () => new Promise(r => {
    const key = currentUser ? `items_${currentUser.uid}` : 'items';
    chrome.storage.local.get([key], res => r(Object.entries(res[key] || {}).map(([t, d]) => ({ title: t, ...d }))));
  });

  const getMaxEp = eps => !eps ? 0 : Math.max(0, ...Object.values(eps).map(d => d.episode || 0));

  async function refresh() {
    const items = await fetchItems();
    render(items);
    if (currentUser) profileImg.src = makeAvatar(currentUser.displayName, 36);
  }

  function buildProgressBar(item) {
    if (item.isFilm) return null;
    const maxEp = getMaxEp(item.episodes), total = item.totalEpisodes || null;
    if (!maxEp) return null;
    const wrap = document.createElement('div'); wrap.className = 'progress-wrap';
    const label = document.createElement('div'); label.className = 'progress-label';
    label.textContent = total ? `Ép. ${maxEp} / ${total}` : `Ép. ${maxEp}`; wrap.appendChild(label);
    if (total) {
      const track = document.createElement('div'); track.className = 'progress-track';
      const fill  = document.createElement('div'); fill.className  = 'progress-fill';
      const pct   = Math.min(100, Math.round((maxEp/total)*100)); fill.style.width = `${pct}%`;
      if (pct >= 100) fill.classList.add('progress-fill--complete');
      track.appendChild(fill); wrap.appendChild(track);
    }
    return wrap;
  }

  const render = (arr) => {
    const q = searchEl.value.trim().toLowerCase();
    let list = arr.filter(i => !q || (i.title||'').toLowerCase().includes(q));
    const sort = sortEl.value;
    if      (sort==='alpha')      list.sort((a,b) => (a.title||'').localeCompare(b.title||''));
    else if (sort==='alpha-desc') list.sort((a,b) => (b.title||'').localeCompare(a.title||''));
    else if (sort==='newest')     list.sort((a,b) => (b.lastSeen||0)-(a.lastSeen||0));
    else if (sort==='oldest')     list.sort((a,b) => (a.lastSeen||0)-(b.lastSeen||0));

    listEl.innerHTML = '';
    if (!list.length) { listEl.innerHTML = '<p class="empty-msg">Aucun animé enregistré.</p>'; return; }

    for (const it of list) {
      const div     = document.createElement('div'); div.className = 'card';
      const leftCol = document.createElement('div'); leftCol.className = 'card-left';
      const img     = document.createElement('img'); img.className = 'thumb';
      img.src = it.image || 'images/placeholder.jpg';
      img.onerror = () => { img.src = 'images/placeholder.jpg'; };
      img.addEventListener('click', () => {
        const langs = Object.keys(it.episodes || {});
        if (!langs.length) return;
        const last = langs.reduce((a,b) => (it.episodes[a].lastSeen||0)>(it.episodes[b].lastSeen||0)?a:b);
        chrome.runtime.sendMessage({ type:'focus-or-open', url:it.episodes[last].url });
      });
      leftCol.appendChild(img);
      const bar = buildProgressBar(it); if (bar) leftCol.appendChild(bar);

      const info     = document.createElement('div'); info.className = 'info';
      const titleRow = document.createElement('div'); titleRow.className = 'title-row';
      const titleEl2 = document.createElement('div'); titleEl2.className = 'title'; titleEl2.textContent = it.title || '(sans titre)';
      const flagBtn  = document.createElement('button'); flagBtn.className = 'flag-btn'; flagBtn.title = 'Signaler'; flagBtn.textContent = '🚩';
      flagBtn.addEventListener('click', e => { e.stopPropagation(); openReportModal(it); });
      titleRow.appendChild(titleEl2); titleRow.appendChild(flagBtn);

      const meta = document.createElement('div'); meta.className = 'meta-langs';
      for (const [lang, data] of Object.entries(it.episodes || {})) {
        const row   = document.createElement('div'); row.className = 'lang-episode';
        const badge = document.createElement('span'); badge.className = 'lang-label';
        badge.textContent = lang === 'default' ? '?' : (Helpers?.getLangLabel?.(lang) || lang.toUpperCase());
        row.appendChild(badge);
        if (!data.isFilm) {
          const ep = document.createElement('span'); ep.className = 'episode-info';
          ep.textContent = `S${data.season||'?'} • Ép ${data.episode||'?'}`;
          row.appendChild(ep);
        }
        meta.appendChild(row);
      }

      const when       = document.createElement('div'); when.className = 'last-seen'; when.textContent = Helpers?.formatDate?.(it.lastSeen) || '';
      const siteBadge  = document.createElement('div'); siteBadge.className = 'site-badge-small';
      const siteImg2   = document.createElement('img'); siteImg2.src = Helpers?.siteLogoUrl?.(it.sourceSite) || '';
      siteImg2.style.cssText = 'width:100%;height:100%;object-fit:contain'; siteBadge.appendChild(siteImg2);

      info.appendChild(titleRow); info.appendChild(meta); info.appendChild(when);
      div.appendChild(leftCol); div.appendChild(info); div.appendChild(siteBadge);
      listEl.appendChild(div);
    }
  };

  const openReportModal = (item) => {
    reportingItem = item; reportAnimeTitle.textContent = item.title;
    reportMsg.textContent = ''; reportIssueForm.style.display = 'none';
    reportIssueDetails.value = ''; reportModal.style.display = 'flex';
  };
  const closeReportModal = () => { reportModal.style.display = 'none'; reportingItem = null; };

  reportCloseBtn.addEventListener('click', closeReportModal);
  reportModal.addEventListener('click', e => { if (e.target===reportModal) closeReportModal(); });

  reportBtnImage.addEventListener('click', async () => {
    if (!reportingItem) return;
    reportBtnImage.disabled = true; reportBtnImage.textContent = 'Envoi...';
    reportMsg.style.color = '#10b981'; reportMsg.textContent = '';
    try {
      const season = Object.values(reportingItem.episodes||{})[0]?.season || 1;
      const r = await send({ type:'report-image', title:reportingItem.title, season, currentImage:reportingItem.image||'' });
      if (r?.success) { reportMsg.textContent = '✓ Signalement envoyé.'; setTimeout(closeReportModal, 2500); }
      else throw new Error(r?.error||'Erreur');
    } catch(e) { reportMsg.style.color='#f87171'; reportMsg.textContent=e.message; }
    finally { reportBtnImage.disabled=false; reportBtnImage.textContent='🖼 Mauvaise image'; }
  });

  reportBtnIssue.addEventListener('click', () => {
    reportIssueForm.style.display = reportIssueForm.style.display==='none' ? 'flex' : 'none';
  });

  reportIssueSend.addEventListener('click', async () => {
    if (!reportingItem) return;
    const details = reportIssueDetails.value.trim();
    if (!details) { reportMsg.style.color='#f87171'; reportMsg.textContent='Décrivez le problème svp'; return; }
    reportIssueSend.disabled=true; reportIssueSend.textContent='Envoi...';
    reportMsg.style.color='#10b981'; reportMsg.textContent='';
    try {
      const season = Object.values(reportingItem.episodes||{})[0]?.season || 1;
      const r = await send({ type:'report-issue', title:reportingItem.title, season, details });
      if (r?.success) { reportMsg.textContent='✓ Signalement envoyé. Merci !'; setTimeout(closeReportModal, 2500); }
      else throw new Error(r?.error||'Erreur');
    } catch(e) { reportMsg.style.color='#f87171'; reportMsg.textContent=e.message; }
    finally { reportIssueSend.disabled=false; reportIssueSend.textContent='Envoyer'; }
  });

  pseudoBtn.addEventListener('click', async () => {
    const p = pseudoInput.value.trim();
    if (!p) { pseudoError.textContent='Veuillez entrer un pseudo'; return; }
    const acc = { uid:`local_${Date.now()}`, displayName:p, isLocal:true };
    currentUser=acc; storeAccount(acc);
    chrome.storage.local.set({ currentUser:acc }, showMainScreen);
  });
  pseudoInput.addEventListener('keypress', e => { if(e.key==='Enter') pseudoBtn.click(); });

  loginBtn.addEventListener('click', async () => {
    loginError.textContent='';
    const email=loginEmail.value.trim(), pass=loginPassword.value.trim();
    if (!email||!pass) { loginError.textContent='Email et mot de passe requis'; return; }
    loginBtn.disabled=true; loginBtn.textContent='Connexion...';
    try {
      const r = await send({ type:'firebase-login', email, password:pass });
      if (!r?.success) throw new Error(r?.error||'Erreur');
      currentUser=r.user; storeAccount(r.user);
      chrome.storage.local.set({ currentUser:r.user }); showMainScreen();
    } catch(e) { loginError.textContent=e.message; }
    finally { loginBtn.disabled=false; loginBtn.textContent='Se connecter'; }
  });

  registerBtn.addEventListener('click', async () => {
    registerError.textContent='';
    const email=registerEmail.value.trim(), pass=registerPassword.value.trim(), name=registerDisplayName.value.trim();
    if (!email||!pass) { registerError.textContent='Email et mot de passe requis'; return; }
    registerBtn.disabled=true; registerBtn.textContent="Inscription...";
    try {
      const r = await send({ type:'firebase-register', email, password:pass, displayName:name });
      if (!r?.success) throw new Error(r?.error||'Erreur');
      currentUser=r.user; storeAccount(r.user);
      chrome.storage.local.set({ currentUser:r.user }); showMainScreen();
    } catch(e) { registerError.textContent=e.message; }
    finally { registerBtn.disabled=false; registerBtn.textContent="S'inscrire"; }
  });

  registerToggleBtn.addEventListener('click', () => { loginForm.style.display=forgotForm.style.display='none'; registerForm.style.display='flex'; });
  loginToggleBtn.addEventListener('click',   () => { registerForm.style.display=forgotForm.style.display='none'; loginForm.style.display='flex'; });

  forgotPasswordBtn.addEventListener('click', () => {
    loginForm.style.display=registerForm.style.display='none'; forgotForm.style.display='flex';
    forgotEmail.value=loginEmail.value; forgotMsg.textContent=''; forgotMsg.style.color='#10b981';
  });
  forgotBackBtn.addEventListener('click', () => { forgotForm.style.display='none'; loginForm.style.display='flex'; });
  forgotSendBtn.addEventListener('click', async () => {
    const email=forgotEmail.value.trim();
    if (!email) { forgotMsg.style.color='#f87171'; forgotMsg.textContent='Email requis'; return; }
    forgotSendBtn.disabled=true; forgotSendBtn.textContent='Envoi...';
    try {
      const r = await send({ type:'firebase-reset-password', email });
      if (r?.success) forgotMsg.textContent='✓ Email envoyé !';
      else throw new Error(r?.error||'Erreur');
    } catch(e) { forgotMsg.style.color='#f87171'; forgotMsg.textContent=e.message; }
    finally { forgotSendBtn.disabled=false; forgotSendBtn.textContent='Envoyer'; }
  });

  searchEl.addEventListener('input',  async () => render(await fetchItems()));
  sortEl.addEventListener('change',   async () => render(await fetchItems()));
  siteBtn.addEventListener('click',   () => chrome.tabs.create({ url:'https://track-my-anime.blogspot.com' }));

  const showProfileModal = async () => {
    profileModal.style.display = 'flex';
    if (currentUser) {
      profileName.textContent  = currentUser.displayName || 'Utilisateur';
      profileEmail.textContent = currentUser.email || (currentUser.isLocal ? 'Compte local' : '');
      profileImgLarge.src      = makeAvatar(currentUser.displayName, 80);
      const items = await fetchItems();
      statAnimes.textContent   = items.length;
      statEpisodes.textContent = items.reduce((s,it) => s+getMaxEp(it.episodes), 0);
    }
    const others = allAccounts.filter(a => a.uid !== currentUser?.uid);
    if (others.length) renderAuthList(profileAccountsList, others, acc => { switchAccount(acc); hideProfileModal(); });
    else profileAccountsList.innerHTML = '';
    chrome.storage.local.get(['urlRedirectEnabled'], r => { settingUrlRedirect.checked = r.urlRedirectEnabled !== false; });
  };
  const hideProfileModal = () => { profileModal.style.display = 'none'; };

  profileCircle.addEventListener('click',    showProfileModal);
  profileCloseBtn.addEventListener('click',  hideProfileModal);
  profileModal.addEventListener('click', e => { if(e.target===profileModal) hideProfileModal(); });
  profileDisconnectBtn.addEventListener('click', doLogout);
  profileAddAccountBtn.addEventListener('click', () => { storeAccount(currentUser); hideProfileModal(); Config.isConnected() ? showLoginScreen() : showPseudoScreen(); });
  profileSettingsBtn.addEventListener('click', () => {
    const v = settingsPanel.style.display !== 'none'; settingsPanel.style.display = v ? 'none' : 'block';
    profileSettingsBtn.style.color = v ? '' : '#06b6d4';
  });
  settingUrlRedirect.addEventListener('change', () => chrome.storage.local.set({ urlRedirectEnabled: settingUrlRedirect.checked }));

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAuth);
  else initAuth();
})();
