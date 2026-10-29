// Storage Module
// Gère le stockage local Chrome (cache local des données)

const StorageModule = (() => {
  const CACHE_KEYS = {
    ITEMS: 'items',
    WATCH_TIME: 'watchTime',
    CONFIG: 'config',
    ACTIVE_DOMAIN: 'activeDomain',
    ERROR_LOG: 'errorLog'
  };

  const DEFAULT_CONFIG = {
    timerEnabled: true,
    timerThreshold: 180000, // 3 minutes
    autoSync: true,
    syncInterval: 3600000 // 1 heure
  };

  const init = async () => {
    return new Promise((resolve) => {
      chrome.storage.local.get([CACHE_KEYS.CONFIG, CACHE_KEYS.ITEMS, CACHE_KEYS.WATCH_TIME], (result) => {
        if (!result[CACHE_KEYS.CONFIG]) {
          chrome.storage.local.set({ [CACHE_KEYS.CONFIG]: DEFAULT_CONFIG });
        }
        if (!result[CACHE_KEYS.ITEMS]) {
          chrome.storage.local.set({ [CACHE_KEYS.ITEMS]: {} });
        }
        if (!result[CACHE_KEYS.WATCH_TIME]) {
          chrome.storage.local.set({ [CACHE_KEYS.WATCH_TIME]: { total: 0, bySite: {} } });
        }
        resolve();
      });
    });
  };

  const getItems = () => {
    return new Promise(resolve => {
      chrome.storage.local.get(CACHE_KEYS.ITEMS, result => {
        resolve(result[CACHE_KEYS.ITEMS] || {});
      });
    });
  };

  const saveItem = (key, itemData) => {
    return new Promise(resolve => {
      chrome.storage.local.get(CACHE_KEYS.ITEMS, result => {
        const items = result[CACHE_KEYS.ITEMS] || {};
        items[key] = itemData;
        chrome.storage.local.set({ [CACHE_KEYS.ITEMS]: items }, () => {
          resolve();
        });
      });
    });
  };

  const deleteItem = (key) => {
    return new Promise(resolve => {
      chrome.storage.local.get(CACHE_KEYS.ITEMS, result => {
        const items = result[CACHE_KEYS.ITEMS] || {};
        delete items[key];
        chrome.storage.local.set({ [CACHE_KEYS.ITEMS]: items }, () => {
          resolve();
        });
      });
    });
  };

  const clearAllItems = () => {
    return new Promise(resolve => {
      chrome.storage.local.set({ [CACHE_KEYS.ITEMS]: {} }, () => {
        resolve();
      });
    });
  };

  const getConfig = () => {
    return new Promise(resolve => {
      chrome.storage.local.get(CACHE_KEYS.CONFIG, result => {
        resolve(result[CACHE_KEYS.CONFIG] || DEFAULT_CONFIG);
      });
    });
  };

  const updateConfig = (partialConfig) => {
    return new Promise(resolve => {
      chrome.storage.local.get(CACHE_KEYS.CONFIG, result => {
        const config = { ...result[CACHE_KEYS.CONFIG], ...partialConfig };
        chrome.storage.local.set({ [CACHE_KEYS.CONFIG]: config }, () => {
          resolve(config);
        });
      });
    });
  };

  const getWatchTime = () => {
    return new Promise(resolve => {
      chrome.storage.local.get(CACHE_KEYS.WATCH_TIME, result => {
        resolve(result[CACHE_KEYS.WATCH_TIME] || { total: 0, bySite: {} });
      });
    });
  };

  const addWatchTime = (elapsed, site) => {
    return new Promise(resolve => {
      chrome.storage.local.get(CACHE_KEYS.WATCH_TIME, result => {
        const watchTime = result[CACHE_KEYS.WATCH_TIME] || { total: 0, bySite: {} };
        watchTime.total = (watchTime.total || 0) + elapsed;
        watchTime.bySite[site] = (watchTime.bySite[site] || 0) + elapsed;
        chrome.storage.local.set({ [CACHE_KEYS.WATCH_TIME]: watchTime }, () => {
          resolve(watchTime);
        });
      });
    });
  };

  const getActiveDomain = () => {
    return new Promise(resolve => {
      chrome.storage.local.get(CACHE_KEYS.ACTIVE_DOMAIN, result => {
        resolve(result[CACHE_KEYS.ACTIVE_DOMAIN] || null);
      });
    });
  };

  const setActiveDomain = (domain) => {
    return new Promise(resolve => {
      chrome.storage.local.set({ [CACHE_KEYS.ACTIVE_DOMAIN]: domain }, () => {
        resolve(domain);
      });
    });
  };

  const logError = (errorData) => {
    return new Promise(resolve => {
      chrome.storage.local.get(CACHE_KEYS.ERROR_LOG, result => {
        const log = result[CACHE_KEYS.ERROR_LOG] || [];
        log.push({
          ...errorData,
          timestamp: Date.now()
        });
        // Garder seulement les 50 dernières erreurs
        chrome.storage.local.set({ [CACHE_KEYS.ERROR_LOG]: log.slice(-50) }, () => {
          resolve(log);
        });
      });
    });
  };

  return {
    init,
    getItems,
    saveItem,
    deleteItem,
    clearAllItems,
    getConfig,
    updateConfig,
    getWatchTime,
    addWatchTime,
    getActiveDomain,
    setActiveDomain,
    logError,
    CACHE_KEYS
  };
})();
