const ExtractorVoiranime = (() => {
  const isTargetHost = () => {
    try { return location.hostname.toLowerCase().includes('voir-anime'); }
    catch(e) { return false; }
  };

  const isBlacklisted = () => {
    const patterns = [
      /voir-anime\.to\/$/i, /voir-anime\.to\/page\//i,
      /\/search/i, /\/login/i
    ];
    return patterns.some(rx => rx.test(location.href));
  };

  const waitForElement = (selector, timeout = 5000) => new Promise(resolve => {
    if (document.querySelector(selector)) return resolve(document.querySelector(selector));
    const obs = new MutationObserver(() => {
      if (document.querySelector(selector)) { obs.disconnect(); resolve(document.querySelector(selector)); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { obs.disconnect(); resolve(null); }, timeout);
  });

  const extract = async () => {
    if (!isTargetHost() || isBlacklisted()) return null;

    await waitForElement('li.active');
    await new Promise(r => setTimeout(r, 500));

    const activeLi = document.querySelector('li.active');
    let title = null, episode = null, season = 1, lang = null;

    if (activeLi) {
      const text = activeLi.innerText.trim();

      if      (text.includes(' VOSTFR ')) lang = 'vostfr';
      else if (text.includes(' VF1 '))    lang = 'vf1';
      else if (text.includes(' VF2 '))    lang = 'vf2';
      else if (text.includes(' VF3 '))    lang = 'vf3';
      else if (text.includes(' VF '))     lang = 'vf';
      else if (text.includes(' VA '))     lang = 'va';
      else if (text.includes(' VJ '))     lang = 'vj';
      else if (text.includes(' VOA '))    lang = 'voa';
      else if (text.includes(' VO '))     lang = 'vo';

      const parts = text.split(' - ');
      if (parts.length >= 2) {
        const titlePart   = parts[0].trim();
        const episodePart = parts[1].trim();

        const epMatch = episodePart.match(/^(\d{1,3})/);
        if (epMatch) episode = Number(epMatch[1]);

        const romanMatch  = titlePart.match(/^(.+?)\s+(I{1,3}|IV|V|VI|VII|VIII|IX|X)$/i);
        const numberMatch = titlePart.match(/^(.+?)\s+(\d+)$/);

        if (romanMatch) {
          title = romanMatch[1].trim();
          const romanMap = {I:1,II:2,III:3,IV:4,V:5,VI:6,VII:7,VIII:8,IX:9,X:10};
          season = romanMap[romanMatch[2].toUpperCase()] || 1;
        } else if (numberMatch && Number(numberMatch[2]) <= 20) {
          title  = numberMatch[1].trim();
          season = Number(numberMatch[2]);
        } else {
          title = titlePart.trim();
        }
      }
    }

    if (!title) {
      title = document.querySelector('meta[property="og:title"]')?.content || document.title || '';
      title = title
        .replace(/Regarder\s+gratuitement\s+/i, '')
        .replace(/\s*\(VF\)\s*/gi, '').replace(/\s*\(VOSTFR\)\s*/gi, '')
        .replace(/\s+en\s+HD\s*/i, '').replace(/\s*-\s*Voir-Anime.*$/i, '').trim();
    }

    const image = document.querySelector('meta[property="og:image"]')?.content || null;

    return {
      title: title || null, image, episode, season, lang,
      url: location.href, sourceSite: 'voiranime',
      totalEpisodes: null,
      isComplete: !!(title && episode !== null && lang)
    };
  };

  return { extract, isTargetHost };
})();
