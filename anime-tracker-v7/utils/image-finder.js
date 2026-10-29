// ImageHelper — Recherche d'images via OMDB + AniList en fallback
// OMDB couvre animes japonais, cartoons, séries, films occidentaux

const JikanHelper = (() => {

  const OMDB_KEY = '6204fdc0';
  const cache    = {};

  // ── Similarité entre deux titres ─────────────────────────────
  const similarity = (a, b) => {
    a = a.toLowerCase().replace(/[^a-z0-9]/g, '');
    b = b.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (a.includes(b) || b.includes(a)) return 0.8;
    let matches = 0;
    const shorter = a.length < b.length ? a : b;
    const longer  = a.length < b.length ? b : a;
    for (const c of shorter) { if (longer.includes(c)) matches++; }
    return matches / longer.length;
  };

  // ── OMDB ─────────────────────────────────────────────────────
  const tryOMDB = async (title) => {
    try {
      // Cherche par titre exact d'abord
      const res = await fetch(
        `https://www.omdbapi.com/?t=${encodeURIComponent(title)}&apikey=${OMDB_KEY}&type=series`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (!res.ok) return null;
      const data = await res.json();

      if (data.Response === 'True' && data.Poster && data.Poster !== 'N/A') {
        const score = similarity(title, data.Title || '');
        if (score >= 0.6) {
          console.log(`[OMDB] ✅ "${title}" → "${data.Title}" (${score.toFixed(2)})`);
          return data.Poster;
        }
        console.log(`[OMDB] ❌ Rejet "${data.Title}" (score: ${score.toFixed(2)})`);
      }

      // Si pas trouvé comme série, essayer sans filtre de type
      const res2 = await fetch(
        `https://www.omdbapi.com/?t=${encodeURIComponent(title)}&apikey=${OMDB_KEY}`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (!res2.ok) return null;
      const data2 = await res2.json();

      if (data2.Response === 'True' && data2.Poster && data2.Poster !== 'N/A') {
        const score = similarity(title, data2.Title || '');
        if (score >= 0.6) {
          console.log(`[OMDB] ✅ "${title}" → "${data2.Title}" (${score.toFixed(2)})`);
          return data2.Poster;
        }
        console.log(`[OMDB] ❌ Rejet "${data2.Title}" (score: ${score.toFixed(2)})`);
      }
    } catch(e) {
      console.warn('[OMDB] ❌', e.message);
    }
    return null;
  };

  // ── AniList (fallback pour animes japonais) ──────────────────
  const tryAniList = async (title) => {
    try {
      const query = `query($s:String){Media(search:$s,type:ANIME){coverImage{large medium}title{romaji english}}}`;
      const res = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query, variables: { s: title } }),
        signal: AbortSignal.timeout(5000)
      });
      if (!res.ok) return null;
      const media = (await res.json())?.data?.Media;
      if (!media) return null;

      const candidates = [media.title?.romaji, media.title?.english].filter(Boolean);
      const score = Math.max(...candidates.map(t => similarity(title, t)));
      if (score >= 0.6) {
        console.log(`[AniList] ✅ "${title}" → "${candidates[0]}" (${score.toFixed(2)})`);
        return media.coverImage?.large || media.coverImage?.medium || null;
      }
      console.log(`[AniList] ❌ Rejet (${score.toFixed(2)}) pour "${title}"`);
    } catch(e) {
      console.warn('[AniList] ❌', e.message);
    }
    return null;
  };

  // ── Point d'entrée ───────────────────────────────────────────
  // domFallback : image déjà extraite par l'extracteur (ex: #imgOeuvre anime-sama)
  const fetchCover = async (title, domFallback = null) => {
    if (!title) return domFallback || null;

    const key = title.toLowerCase().trim();
    if (cache[key] !== undefined) return cache[key] || domFallback || null;

    // 1. OMDB (couvre tout : animes, cartoons, séries)
    let url = await tryOMDB(title);

    // 2. AniList (fallback pour animes japonais non trouvés sur OMDB)
    if (!url) url = await tryAniList(title);

    // 3. Image DOM fournie par l'extracteur
    if (!url && domFallback) {
      console.log(`[Image] 🖼️ Fallback DOM pour "${title}"`);
      url = domFallback;
    }

    if (!url) console.log(`[Image] ⚠️ Aucune image pour "${title}"`);

    cache[key] = url;
    return url;
  };

  return { fetchCover };
})();
