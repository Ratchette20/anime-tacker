/*
URL Redirect v3 — Notification post-redirect uniquement
La redirection réelle est gérée par declarativeNetRequest (rules.json)
Ce module affiche juste une notification quand on détecte qu'on vient d'être redirigé
*/

const UrlRedirect = (() => {
  const TARGET_HOST = 'anime-sama.to';
  const isAnimeSamaTo = () => location.hostname.toLowerCase().replace(/^www\./,'') === TARGET_HOST;

  let stylesInjected = false;

  const injectStyles = () => {
    if (stylesInjected) return;
    stylesInjected = true;
    const s = document.createElement('style');
    s.textContent = `
      @keyframes at-slide-in { from{opacity:0;transform:translateX(-12px)} to{opacity:1;transform:translateX(0)} }
      @keyframes at-fade-out  { to{opacity:0;transform:translateX(-8px)} }
      #at-notif-container { position:fixed;top:16px;left:16px;z-index:2147483647;display:flex;flex-direction:column;gap:8px;pointer-events:none; }
      .at-notif {
        background:#0f172a; border:1px solid rgba(6,182,212,0.35); border-radius:12px;
        padding:11px 14px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
        font-size:13px; color:#e2e8f0; box-shadow:0 8px 24px rgba(0,0,0,0.55);
        max-width:280px; line-height:1.55; animation:at-slide-in 0.3s ease; pointer-events:auto;
      }
      .at-notif strong{color:#06b6d4}
      .at-notif code{background:rgba(255,255,255,0.07);border-radius:4px;padding:1px 5px;font-size:12px;font-family:monospace;}
    `;
    document.head.appendChild(s);
  };

  const showNotif = (html, duration = 5000) => {
    injectStyles();
    let container = document.getElementById('at-notif-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'at-notif-container';
      document.body.appendChild(container);
    }
    const box = document.createElement('div');
    box.className = 'at-notif';
    box.innerHTML = html;
    container.appendChild(box);
    setTimeout(() => {
      box.style.animation = 'at-fade-out 0.4s ease forwards';
      setTimeout(() => box.remove(), 400);
    }, duration);
  };

  // Détecter si on vient d'un autre domaine anime-sama (redirect déclaratif)
  const checkPostRedirect = () => {
    if (!isAnimeSamaTo()) return;

    const from = document.referrer ? new URL(document.referrer).hostname.toLowerCase().replace(/^www\./, '') : '';
    const wasRedirected = from && from.match(/^anime-sama\.\w+$/) && from !== TARGET_HOST;

    if (!wasRedirected) return;

    showNotif(
      `<span style="font-size:15px;margin-right:6px">🔄</span>` +
      `<strong>Redirection automatique</strong><br>` +
      `<code>${from}</code> → <code style="color:#06b6d4">${TARGET_HOST}</code>`,
      5000
    );

    // Afficher le dernier épisode vu après 1.8s
    setTimeout(async () => {
      try {
        const storage = await new Promise(r => chrome.storage.local.get(['currentUser'], r));
        const cu = storage.currentUser;
        const itemsKey = cu ? `items_${cu.uid}` : 'items';
        const items = await new Promise(r => chrome.storage.local.get([itemsKey], res => r(res[itemsKey] || {})));

        const slug = location.pathname.split('/').filter(Boolean)[1] || '';
        let found = null;

        for (const item of Object.values(items)) {
          for (const [lang, ep] of Object.entries(item.episodes || {})) {
            if (ep.url && ep.url.includes(`/${slug}/`) && !ep.isFilm) {
              found = { title: item.title, lang, season: ep.season, episode: ep.episode };
              break;
            }
          }
          if (found) break;
        }

        if (found) {
          showNotif(
            `<span style="font-size:15px;margin-right:6px">📺</span>` +
            `<strong style="color:#f59e0b">Vous vous étiez arrêté à</strong><br>` +
            `${found.title}<br>` +
            `<strong>Saison ${found.season||'?'} • Épisode ${found.episode||'?'}</strong>` +
            ` <code>${(found.lang||'').toUpperCase()}</code>`,
            7000
          );
        }
      } catch(e) {}
    }, 1800);
  };

  return { checkPostRedirect };
})();
