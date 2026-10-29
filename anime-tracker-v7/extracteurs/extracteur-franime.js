// Extracteur FRAnime v3 — images via Jikan + totalEpisodes

const ExtractorFranime = (() => {
  const isTargetHost = () => {
    try { return location.hostname.toLowerCase().includes('franime'); }
    catch(e) { return false; }
  };

  const isBlacklisted = () => {
    const patterns = [/\/recherche/i, /^\/franime.fr\/$/i, /\/login/i, /\/register/i];
    return patterns.some(rx => rx.test(location.href));
  };

  // Extraire le nombre total d'épisodes depuis le select FRAnime
  const extractTotalEpisodes = () => {
    // FRAnime : <select class="h-10 ..."><option value="1">1</option>...
    const selects = document.querySelectorAll('select');
    let max = 0;
    for (const sel of selects) {
      const options = sel.querySelectorAll('option');
      if (options.length > max) {
        let localMax = 0;
        for (const opt of options) {
          const n = parseInt(opt.value || opt.textContent, 10);
          if (!isNaN(n) && n > localMax) localMax = n;
        }
        if (localMax > max) max = localMax;
      }
    }
    return max > 0 ? max : null;
  };

  const extract = async () => {
    if (!isTargetHost() || isBlacklisted()) return null;

    const url = new URL(location.href);

    let title = null;
    const pathMatch = url.pathname.match(/\/anime\/([^\/]+)/);
    if (pathMatch) {
      title = pathMatch[1].replace(/-/g, ' ').trim()
        .split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }

    if (!title) {
      title = document.querySelector('h1')?.innerText || '';
      title = title
        .replace(/\s*-\s*FRAnime\.fr.*$/i, '')
        .replace(/\s*#1\s+DE\s+L'ANIME.*$/i, '')
        .replace(/\s+S\d+\s+EP\d+/i, '')
        .replace(/\s+(VF|VOSTFR|VA|VO)\s*/gi, ' ')
        .replace(/\s+Episode\s+\d+/i, '').trim();
    }

    const image = await JikanHelper.fetchCover(title);

    const s        = url.searchParams.get('s');
    const epParam  = url.searchParams.get('ep');
    const langParam = url.searchParams.get('lang');

    let episode = null;
    if (epParam) {
      const m = epParam.match(/(\d{1,4})/);
      if (m) episode = Number(m[1]);
    }

    const season = s ? Number(s) : 1;

    const langMap = { vf:'vf', vf1:'vf1', vf2:'vf2', vf3:'vf3',
                      vostfr:'vostfr', vj:'vj', vo:'vo', voa:'voa', va:'va' };
    const lang = langMap[langParam?.toLowerCase()] || null;

    const totalEpisodes = extractTotalEpisodes();

    return {
      title: title || null, image, episode, season, lang,
      url: location.href, sourceSite: 'franime',
      totalEpisodes,
      isComplete: !!(title && episode !== null && lang)
    };
  };

  return { extract, isTargetHost };
})();
