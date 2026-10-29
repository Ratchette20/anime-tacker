// Timer Module v6 — Fiable + résistant à "Extension context invalidated"
// Le content script stocke startTime dans chrome.storage.local
// Le background flush sur tab navigation/close
// Minimum 5 minutes pour enregistrer l'historique d'épisodes

const TimerModule = (() => {
  let _tabId      = null;
  let _startTime  = null;
  let _site       = null;
  let _title      = null;
  let _season     = null;
  let _episode    = null;
  let _lang       = null;
  let _hidden     = 0;
  let _hiddenSince= null;

  // Wrapper sécurisé pour chrome.runtime.sendMessage
  // Évite le crash "Extension context invalidated"
  const safeSend = (msg, cb) => {
    try {
      if (!chrome?.runtime?.id) return; // contexte invalide
      chrome.runtime.sendMessage(msg, res => {
        if (chrome.runtime.lastError) return; // swallow silently
        if (cb) cb(res);
      });
    } catch(e) {
      // Extension rechargée pendant que la page était ouverte — ignorer
    }
  };

  // Wrapper sécurisé pour chrome.storage.local.set
  const safeSet = (data) => {
    try {
      if (!chrome?.runtime?.id) return;
      chrome.storage.local.set(data);
    } catch(e) {}
  };

  const persist = () => {
    if (!_tabId || !_startTime) return;
    safeSet({
      [`_timer_${_tabId}`]: {
        startTime: _startTime,
        site:      _site,
        title:     _title,
        season:    _season,
        episode:   _episode,
        lang:      _lang,
        hiddenMs:  _hidden
      }
    });
  };

  const start = (site, animeData = {}) => {
    safeSend({ type: 'get-tab-id' }, res => {
      _tabId    = res?.tabId || null;
      _startTime= Date.now();
      _site     = site;
      _title    = animeData.title    || null;
      _season   = animeData.season   || 1;
      _episode  = animeData.episode  || null;
      _lang     = animeData.lang     || null;
      _hidden   = 0;
      _hiddenSince = null;
      persist();
      console.log(`[Timer ▶] tab=${_tabId} | ${site} | "${_title}" S${_season}E${_episode}`);
    });
  };

  // Pause quand l'onglet est caché
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      _hiddenSince = Date.now();
    } else if (_hiddenSince) {
      _hidden += Date.now() - _hiddenSince;
      _hiddenSince = null;
      persist();
    }
  });

  // Mise à jour finale avant de quitter — PAS de .get() ici
  window.addEventListener('beforeunload', () => {
    if (!_tabId || !_startTime) return;
    if (_hiddenSince) _hidden += Date.now() - _hiddenSince;
    persist();
  });

  return { start };
})();
