// Extracteur ADN v4 — Épisode RELATIF à la saison affichée
// Exemple : Fairy Tail S2 → EP49 sur ADN = EP1 de la saison

const ExtractorADN = (() => {
  const isTargetHost = () => {
    try { return location.hostname.toLowerCase().includes('animationdigitalnetwork'); }
    catch(e) { return false; }
  };

  const isBlacklisted = () =>
    [/\/search/i, /\/login/i, /\/register/i, /\/catalogue/i]
      .some(rx => rx.test(location.href));

  // Position du lien actif dans la liste des épisodes = numéro relatif
  const extractRelativeEpisode = () => {
    // 1. Trouver l'URL canonique de l'épisode en cours
    const currentPath = location.pathname; // ex: /video/269-fairy-tail/3676-episode-49

    // 2. Liste ordonnée des épisodes de la saison affichée
    const items = document.querySelectorAll('[data-testid^="season-list-item-"] a[href*="-episode-"]');
    if (!items.length) {
      // Fallback : extraire depuis l'URL
      const m = currentPath.match(/-episode-(\d{1,4})/i);
      return m ? Number(m[1]) : null;
    }

    // 3. Trouver la position du lien actif
    let position = null;
    for (let i = 0; i < items.length; i++) {
      const href = items[i].getAttribute('href') || '';
      // Comparer le path (sans domaine)
      if (currentPath.includes(href.split('?')[0]) || href.includes(currentPath.split('?')[0])) {
        position = i + 1; // 1-indexé
        break;
      }
    }

    // 4. Fallback sur l'URL si pas trouvé dans la liste
    if (position === null) {
      const m = currentPath.match(/-episode-(\d{1,4})/i);
      const absEp = m ? Number(m[1]) : null;
      if (absEp !== null && items.length > 0) {
        // Calculer le numéro du premier épisode de la saison
        const firstHref = items[0].getAttribute('href') || '';
        const firstMatch = firstHref.match(/-episode-(\d{1,4})/i);
        if (firstMatch) {
          const firstEp = Number(firstMatch[1]);
          position = absEp - firstEp + 1;
        } else {
          position = absEp;
        }
      } else {
        position = absEp;
      }
    }

    return position;
  };

  const extractTotalEpisodes = () => {
    const items = document.querySelectorAll('[data-testid^="season-list-item-"]');
    return items.length > 0 ? items.length : null;
  };

  const extract = async () => {
    if (!isTargetHost() || isBlacklisted()) return null;

    // Titre
    let title = document.querySelector('h1 a[href^="/video/"]')?.innerText?.trim() || null;
    if (!title) {
      title = document.querySelector('h1')?.innerText
           || document.querySelector('meta[property="og:title"]')?.content
           || document.title || '';
      title = title
        .replace(/\s*-\s*\d+\s+Épisode\s+\d+.*$/i, '')
        .replace(/\s*-\s*streaming.*$/i, '')
        .replace(/\s*-\s*VF\s+et\s+VOSTFR.*$/i, '')
        .replace(/\s*-\s*ADN.*$/i, '')
        .replace(/\s*\|.*$/i, '').trim();
    }
    if (!title) return null;

    // Image
    const image = await JikanHelper.fetchCover(title);

    // Saison
    let season = 1;
    const seasonMatch = document.body.innerText.match(/Saison\s+(\d+)/i);
    if (seasonMatch) season = Number(seasonMatch[1]);

    // Épisode relatif à la saison
    const episode = extractRelativeEpisode();
    console.log(`[ADN] Titre: "${title}" | Saison: ${season} | Ép relatif: ${episode}`);

    // Langue
    let lang = null;
    const langMap = { VO:'vo', VOA:'voa', VJ:'vj', VF:'vf', VF1:'vf1', VF2:'vf2', VF3:'vf3', VOSTFR:'vostfr', VA:'va' };
    for (const b of document.querySelectorAll('.text-blue-500.font-extrabold, div[class*="text-blue"]')) {
      const t = b.innerText.trim();
      if (langMap[t]) { lang = langMap[t]; break; }
    }
    if (!lang) {
      const body = document.body.innerText;
      for (const [k, v] of Object.entries(langMap)) {
        if (body.includes(k)) { lang = v; break; }
      }
    }

    return {
      title, image,
      episode: episode !== null ? episode : null,
      season, lang,
      url: location.href,
      sourceSite: 'adn',
      totalEpisodes: extractTotalEpisodes(),
      isComplete: !!(title && episode !== null && lang)
    };
  };

  return { extract, isTargetHost };
})();
