const ContentScript = (() => {
  let currentAnimeData = null;
  let lastSignature    = null;   // dernière page/épisode traité avec succès
  let attempts         = 0;
  let running          = false;
  let postRedirectDone = false;

  const selectExtractor = () => {
    const h = location.hostname.toLowerCase();
    if (h.includes('anime-sama'))              return ExtractorAnimeSama;
    if (h.includes('franime'))                 return ExtractorFranime;
    if (h.includes('voir-anime'))              return ExtractorVoiranime;
    if (h.includes('animationdigitalnetwork')) return ExtractorADN;
    if (h.includes('crunchyroll'))             return ExtractorCrunchyroll;
    return null;
  };

  const safeSend = (msg, cb) => {
    try {
      if (!chrome?.runtime?.id) return;
      chrome.runtime.sendMessage(msg, res => {
        if (chrome.runtime.lastError) return;
        if (cb) cb(res);
      });
    } catch (e) {}
  };

  // Un film n'a pas de numéro d'épisode : il doit quand même être enregistré
  const isValid = d => !!(d && d.title && (d.isFilm || (d.episode !== null && d.episode !== undefined)));

  // Change quand l'utilisateur change de page OU d'épisode (sites SPA, sélecteur Anime-Sama)
  const signature = () => `${location.href}|${document.querySelector('#selectEpisodes')?.value || ''}`;

  const processExtractedData = async (extractedData) => {
    if (!isValid(extractedData)) return false;
    currentAnimeData = { ...extractedData, detectedAt: Date.now() };
    const imgTitle  = currentAnimeData.title;
    const imgSeason = currentAnimeData.isFilm ? 1 : (currentAnimeData.season || 1);
    await new Promise(resolve => {
      safeSend({ type: 'get-db-image', title: imgTitle, season: imgSeason }, res => {
        if (res?.image) currentAnimeData.image = res.image;
        else if (Helpers.looksLikeLogo(currentAnimeData.image))
          safeSend({ type: 'request-db-image', title: imgTitle, season: imgSeason, currentImage: currentAnimeData.image || '' });
        resolve();
      });
      setTimeout(resolve, 4000);
    });
    safeSend({ type: 'save-anime', data: currentAnimeData }, res => {
      if (res?.saved)   console.log('[Tracker] Sauvegardé', res.key);
      if (res?.updated) console.log('[Tracker] Mis à jour', res.key);
    });
    return true;
  };

  const run = async () => {
    if (running) return;
    const extractor = selectExtractor();
    if (!extractor || !extractor.isTargetHost()) return;
    running = true;
    const sig = signature();
    try {
      if (!postRedirectDone && typeof UrlRedirect !== 'undefined') { postRedirectDone = true; UrlRedirect.checkPostRedirect(); }
      let extracted = null;
      try { extracted = await extractor.extract(); }
      catch (e) { console.error('[Tracker] Extraction error:', e); }
      const ok = extracted ? await processExtractedData(extracted) : false;
      if (ok) { lastSignature = sig; attempts = 0; console.log('[Tracker] OK:', currentAnimeData.title); }
      else if (++attempts >= 3) { lastSignature = sig; attempts = 0; } // page sans animé : on arrête de réessayer
    } finally { running = false; }
  };

  const init = () => {
    run();
    const timer = setInterval(() => {
      if (!chrome?.runtime?.id) { clearInterval(timer); return; } // extension rechargée
      if (!running && signature() !== lastSignature) run();
    }, 2000);
  };

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'get-current-anime') sendResponse({ data: currentAnimeData });
  });

  return { init };
})();

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => ContentScript.init());
else ContentScript.init();
