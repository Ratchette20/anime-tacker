const ContentScript = (() => {
  let currentAnimeData = null;
  let isInitialized    = false;

  const selectExtractor = () => {
    const h = location.hostname.toLowerCase();
    if (h.includes('anime-sama'))                              return ExtractorAnimeSama;
    if (h.includes('franime'))                                 return ExtractorFranime;
    if (h.includes('voir-anime'))                              return ExtractorVoiranime;
    if (h.includes('animationdigitalnetwork'))                 return ExtractorADN;
    if (h.includes('crunchyroll'))                             return ExtractorCrunchyroll;
    return null;
  };

  const safeSend = (msg, cb) => {
    try {
      if (!chrome?.runtime?.id) return;
      chrome.runtime.sendMessage(msg, res => {
        if (chrome.runtime.lastError) return;
        if (cb) cb(res);
      });
    } catch(e) {}
  };

  const processExtractedData = async (extractedData) => {
    if (!extractedData || !Helpers.isValidAnimeData(extractedData)) return false;
    currentAnimeData = { ...extractedData, detectedAt: Date.now() };
    await new Promise(resolve => {
      safeSend({ type: 'get-db-image', title: currentAnimeData.title, season: currentAnimeData.season || 1 }, res => {
        if (res?.image) {
          currentAnimeData.image = res.image;
        } else if (Helpers.looksLikeLogo(currentAnimeData.image)) {
          safeSend({ type: 'request-db-image', title: currentAnimeData.title, season: currentAnimeData.season || 1, currentImage: currentAnimeData.image || '' });
        }
        resolve();
      });
    });
    safeSend({ type: 'save-anime', data: currentAnimeData }, res => {
      if (res?.saved)   console.log('[Tracker] Sauvegardé');
      if (res?.updated) console.log('[Tracker] Mis à jour');
    });
    return true;
  };

  const init = async () => {
    if (isInitialized) return;
    if (typeof UrlRedirect !== 'undefined') UrlRedirect.checkPostRedirect();
    const extractor = selectExtractor();
    if (!extractor || !extractor.isTargetHost()) return;
    let extracted = null;
    try { extracted = await extractor.extract(); }
    catch(e) { console.error('[Tracker] Extraction error:', e); return; }
    if (!extracted) return;
    const ok = await processExtractedData(extracted);
    if (!ok) return;
    isInitialized = true;
    console.log('[Tracker] Init OK:', currentAnimeData.title);
  };

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'get-current-anime') sendResponse({ data: currentAnimeData });
  });

  return { init };
})();

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => ContentScript.init());
else ContentScript.init();
