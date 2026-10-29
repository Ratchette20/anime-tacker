// Helpers v2 — Fonctions utilitaires partagées

const Helpers = (() => {
  const looksLikeLogo = (url) => {
    if (!url) return true;
    const lower = url.toLowerCase();
    return lower.includes('logo') || lower.includes('favicon') || lower.includes('brand') || lower.includes('placeholder');
  };

  const fetchAniListCover = (title) => {
    return new Promise(resolve => {
      if (!title) { resolve(null); return; }
      const query = `query ($search: String) { Media (search: $search, type: ANIME) { coverImage { large medium } siteUrl } }`;
      fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ query, variables: { search: title } })
      })
        .then(resp => resp.ok ? resp.json() : null)
        .then(data => {
          const ci = data?.data?.Media?.coverImage;
          resolve(ci ? (ci.large || ci.medium || null) : null);
        })
        .catch(() => resolve(null));
    });
  };

  const siteLogoUrl = (sourceSite) => {
    const logos = {
      'anime-sama': 'images/anime-sama.jpg',
      'franime': 'images/franime.jpg',
      'voiranime': 'images/voiranime.jpg',
      'adn': 'images/adn.jpg',
      'crunchyroll': 'images/crunchyroll.jpg'
    };
    return chrome.runtime.getURL(logos[sourceSite] || 'images/placeholder.jpg');
  };

  const getSiteFromHost = () => {
    const host = location.hostname.toLowerCase();
    if (host.includes('anime-sama')) return 'anime-sama';
    if (host.includes('franime')) return 'franime';
    if (host.includes('voiranime') || host.includes('voir-anime')) return 'voiranime';
    if (host.includes('animationdigitalnetwork')) return 'adn';
    if (host.includes('crunchyroll')) return 'crunchyroll';
    return 'unknown';
  };

  const getLangLabel = (lang) => {
    const labels = {
      'vf': 'VF', 'vf1': 'VF1', 'vf2': 'VF2', 'vf3': 'VF3',
      'vf4': 'VF4', 'vf5': 'VF5',
      'vostfr': 'VOSTFR', 'vo': 'VO', 'vj': 'VJ', 'voa': 'VOA',
      'va': 'VA',
      'vf-quad': 'VF Quad', 'default': '?'
    };
    return labels[lang] || (lang ? lang.toUpperCase() : '');
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  const formatTime = (ms) => {
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0) parts.push(`${seconds}s`);
    return parts.length > 0 ? parts.join(' ') : '0s';
  };

  const mergeEpisodes = (existing, incoming) => {
    if (!existing) return incoming;
    if (!incoming) return existing;
    const merged = { ...existing };
    for (const lang in incoming) {
      if (merged[lang]) {
        const incomingEp = incoming[lang].episode || 0;
        const existingEp = merged[lang].episode || 0;
        if (incomingEp > existingEp) {
          merged[lang] = { ...merged[lang], ...incoming[lang] };
        } else if (incomingEp === existingEp) {
          if ((incoming[lang].lastSeen || 0) > (merged[lang].lastSeen || 0)) {
            merged[lang] = incoming[lang];
          }
        }
      } else {
        merged[lang] = incoming[lang];
      }
    }
    return merged;
  };

  const isValidAnimeData = (data) => {
    return !!(data && data.title && data.episode !== null && data.episode !== undefined);
  };

  const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
      const later = () => { clearTimeout(timeout); func(...args); };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  };

  const throttle = (func, limit) => {
    let inThrottle;
    return function (...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  };

  return {
    looksLikeLogo, fetchAniListCover, siteLogoUrl, getSiteFromHost,
    getLangLabel, formatDate, formatTime, mergeEpisodes,
    isValidAnimeData, debounce, throttle
  };
})();
