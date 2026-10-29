// Extracteur Anime-Sama v4.0 — images via Jikan + totalEpisodes + VA

const ExtractorAnimeSama = (() => {

  const isTargetHost = () => {
    try { return location.hostname.toLowerCase().includes('anime-sama'); }
    catch(e) { return false; }
  };

  const isBlacklisted = () => {
    const patterns = [
      /\/search/i, /\/rechercher/i, /\/login/i, /\/signin/i, /\/register/i,
      /\/account/i, /\/profil/i, /\/news/i, /\/contact/i, /\/catalogue$/i,
      /\/planning/i, /\/aide/i
    ];
    return patterns.some(rx => rx.test(location.href));
  };

  const waitFor = (selector, timeout = 5000) => new Promise(resolve => {
    if (document.querySelector(selector)) return resolve(document.querySelector(selector));
    const obs = new MutationObserver(() => {
      if (document.querySelector(selector)) { obs.disconnect(); resolve(document.querySelector(selector)); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { obs.disconnect(); resolve(null); }, timeout);
  });

  const slugToTitle = (slug) =>
    slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  const formatFilmSegment = (seg) => {
    const numbered = seg.match(/^film(\d+)$/i);
    if (numbered) return `Film ${numbered[1]}`;
    return slugToTitle(seg);
  };

  const parseUrl = () => {
    const parts = location.pathname.replace(/^\/|\/$/g, '').split('/');
    const animeSlug = parts[1] || null;
    const typeSlug  = parts[2] || null;
    const langSlug  = parts[3] || null;

    const isFilm      = typeSlug ? /^film/i.test(typeSlug) : false;
    const filmSegment = isFilm ? formatFilmSegment(typeSlug) : null;

    let season = null;
    if (!isFilm && typeSlug) {
      const m = typeSlug.match(/saison[-_]?(\d+)/i);
      if (m) season = Number(m[1]);
    }

    let lang = null;
    if (langSlug) {
      const l = langSlug.toLowerCase();
      if (/^vostfr$/i.test(l))       lang = 'vostfr';
      else if (/^va$/i.test(l))       lang = 'va';
      else if (/^vo$/i.test(l))       lang = 'vo';
      else if (/^vj$/i.test(l))       lang = 'vj';
      else if (/^voa$/i.test(l))      lang = 'voa';
      else if (/^vf(\d*)$/i.test(l))  lang = l;
    }

    return { animeSlug, isFilm, filmSegment, season, lang };
  };

  // Extraire le nombre total d'épisodes depuis le select
  const extractTotalEpisodes = () => {
    const sel = document.querySelector('#selectEpisodes');
    if (!sel) return null;
    const options = sel.querySelectorAll('option');
    if (!options.length) return null;
    // Le dernier option contient le numéro le plus élevé
    let max = 0;
    for (const opt of options) {
      const m = (opt.textContent || opt.value || '').match(/(\d{1,4})/);
      if (m) {
        const n = Number(m[1]);
        if (n > max) max = n;
      }
    }
    return max > 0 ? max : null;
  };

  const extract = async () => {
    if (!isTargetHost() || isBlacklisted()) return null;

    const parsed = parseUrl();

    await Promise.race([
      waitFor('#imgOeuvre'),
      waitFor('#selectEpisodes'),
      new Promise(r => setTimeout(r, 3000))
    ]);
    await new Promise(r => setTimeout(r, 600));

    const titleEl = document.querySelector('#titreOeuvre');
    const imgEl   = document.querySelector('#imgOeuvre');

    let title = titleEl
      ? titleEl.innerText.trim().replace(/\s*-\s*Anime-Sama.*$/i, '').trim()
      : (parsed.animeSlug ? slugToTitle(parsed.animeSlug) : null);

    if (!title) return null;

    const domImage = imgEl ? imgEl.src : null;
    const image = await JikanHelper.fetchCover(title, domImage);

    // ── Film ─────────────────────────────────────────────────
    if (parsed.isFilm) {
      return {
        title:      `${title} — ${parsed.filmSegment || 'Film'}`,
        image,
        episode:    null,
        season:     null,
        lang:       parsed.lang,
        isFilm:     true,
        animeTitle: title,
        filmTitle:  parsed.filmSegment || 'Film',
        url:        location.href,
        sourceSite: 'anime-sama',
        totalEpisodes: null,
        isComplete: !!(title && parsed.lang)
      };
    }

    // ── Série ─────────────────────────────────────────────────
    let episode = null;
    const sel = document.querySelector('#selectEpisodes');
    if (sel?.value) {
      const m = sel.value.match(/(\d{1,4})/);
      if (m) episode = Number(m[1]);
    }

    const totalEpisodes = extractTotalEpisodes();

    return {
      title, image, episode,
      season:    parsed.season,
      lang:      parsed.lang,
      isFilm:    false,
      filmTitle: null,
      url:       location.href,
      sourceSite: 'anime-sama',
      totalEpisodes,
      isComplete: !!(title && episode !== null && parsed.lang)
    };
  };

  return { extract, isTargetHost };
})();
