// Communication Module
// Gère la synchronisation avec Firebase et la mise à jour des URLs

const CommunicationModule = (() => {
  let syncState = {
    isSyncing: false,
    lastSync: null,
    isConnected: false
  };

  // Envoyer les données de l'anime au background (qui va les sauvegarder)
  const saveAnimeToDb = async (animeData) => {
    // Toujours envoyer au background - c'est lui qui décide (LOCAL vs FIREBASE)
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'save-anime',
        data: animeData
      }, response => {
        if (response && response.success) {
          resolve(response);
        } else {
          reject(new Error(response?.error || 'Erreur sauvegarde'));
        }
      });
    });
  };

  // Récupérer tous les animes depuis Firestore
  const syncFromDatabase = async () => {
    if (syncState.isSyncing) {
      console.log('[Anime Tracker] Sync déjà en cours');
      return;
    }

    // Si connection désactivée, ne pas syncer
    if (!Config.isConnected()) {
      console.log('[Anime Tracker] Sync désactivée (mode local)');
      return [];
    }

    syncState.isSyncing = true;
    try {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'sync-from-db'
        }, response => {
          syncState.isSyncing = false;
          syncState.lastSync = Date.now();
          
          if (response && response.success) {
            syncState.isConnected = true;
            console.log('[Anime Tracker] Sync réussie');
            resolve(response.data);
          } else {
            syncState.isConnected = false;
            reject(new Error(response?.error || 'Erreur sync'));
          }
        });
      });
    } catch (error) {
      syncState.isSyncing = false;
      throw error;
    }
  };

  // Vérifier le domaine actif anime-sama
  const checkAnimeSamaDomain = async () => {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        type: 'check-anime-sama-domain'
      }, response => {
        resolve(response);
      });
    });
  };

  // Mettre à jour les URLs si le domaine change
  const updateAnimeSamaUrls = async (newDomain) => {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        type: 'update-anime-sama-urls',
        newDomain
      }, response => {
        resolve(response);
      });
    });
  };

  // Envoyer le temps de visionnage
  const reportWatchTime = async (elapsed, site, sessionId) => {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        type: 'update-watch-time',
        elapsed,
        site,
        sessionId,
        final: true
      }, response => {
        resolve(response);
      });
    });
  };

  // Récupérer l'historique de temps par site
  const getWatchTimeStats = async () => {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        type: 'get-watch-time'
      }, response => {
        resolve(response || { total: 0, bySite: {} });
      });
    });
  };

  const getSyncState = () => ({ ...syncState });

  // Auto-sync toutes les heures
  const startAutoSync = () => {
    setInterval(() => {
      syncFromDatabase().catch(err => {
        console.error('[Anime Tracker] Auto-sync erreur:', err);
      });
    }, 3600000); // 1 heure
  };

  return {
    saveAnimeToDb,
    syncFromDatabase,
    checkAnimeSamaDomain,
    updateAnimeSamaUrls,
    reportWatchTime,
    getWatchTimeStats,
    getSyncState,
    startAutoSync
  };
})();
