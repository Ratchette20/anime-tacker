// Extracteur Crunchyroll v3 — images via Jikan

const ExtractorCrunchyroll = (() => {
  const isTargetHost = () => {
    try { return location.hostname.toLowerCase().includes('crunchyroll'); }
    catch(e) { return false; }
  };

  const isBlacklisted = () => {
    const patterns = [/crunchyroll\.com\/(?!.*watch)/i, /\/search/i, /\/login/i, /\/register/i];
    return patterns.some(rx => rx.test(location.href));
  };

  const extract = async () => {
    if (!isTargetHost() || isBlacklisted()) return null;

    let title = null;
    const h4 = document.querySelector('h4.text--gq6o-.text--is-l--iccTo, h4[class*="text--gq6o"]');
    if (h4) title = h4.innerText.trim();

    if (!title) {
      title = document.querySelector('meta[property="og:title"]')?.content || document.title || '';
      title = title.replace(/\s*-\s*Regarder.*$/i, '').trim();
    }

    const image = await JikanHelper.fetchCover(title);

    let episode = null;
    const h1 = document.querySelector('h1.heading--nKNOf, h1[class*="heading"]');
    if (h1) {
      const m = (h1.innerText || '').match(/^E(\d{1,4})\s*-/i);
      if (m) episode = Number(m[1]);
    }

    return {
      title: title || null, image, episode,
      season: null, lang: null,
      url: location.href, sourceSite: 'crunchyroll',
      totalEpisodes: null, // Crunchyroll ne permet pas l'extraction du total
      isComplete: !!(title && episode !== null)
    };
  };

  return { extract, isTargetHost };
})();
