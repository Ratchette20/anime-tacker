// Configuration globale de l'extension
const Config = (() => {
  const CONNECTION_ENABLED = true;

  const FIREBASE_CONFIG = {
    apiKey:            "AIzaSyCNTOWxHmQ7jlskBYXTUpw6VIUX1IVIfHA",
    authDomain:        "anime-tracker-1894a.firebaseapp.com",
    projectId:         "anime-tracker-1894a",
    storageBucket:     "anime-tracker-1894a.firebasestorage.app",
    messagingSenderId: "12245205507",
    appId:             "1:12245205507:web:bf72b5c146c857e20c8436"
  };

  const SITE_URL  = "https://track-my-anime.blogspot.com";
  const SAVE_MODE = CONNECTION_ENABLED ? 'firebase' : 'local';

  const isConnected      = () => CONNECTION_ENABLED;
  const getFirebaseConfig = () => CONNECTION_ENABLED ? FIREBASE_CONFIG : null;
  const getSiteUrl       = () => CONNECTION_ENABLED ? SITE_URL : null;
  const getSaveMode      = () => SAVE_MODE;
  const logStatus        = () => {
    console.log('[Anime Tracker] Config:', CONNECTION_ENABLED
      ? '✅ CONNECTÉ — Firebase: ' + FIREBASE_CONFIG.projectId
      : '❌ LOCAL SEULEMENT');
  };

  return { isConnected, getFirebaseConfig, getSiteUrl, getSaveMode, logStatus, CONNECTION_ENABLED };
})();

Config.logStatus();
