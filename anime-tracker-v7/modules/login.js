// Login Module
// Gère l'authentification Firebase avec Email/Password ou pseudo local

const LoginModule = (() => {
  let authState = {
    isLoggedIn: false,
    user: null,
    token: null
  };

  const init = async () => {
    // Charger l'état auth depuis le stockage local
    return new Promise(resolve => {
      chrome.storage.local.get(['authToken', 'authUser'], result => {
        if (result.authToken && result.authUser) {
          authState.token = result.authToken;
          authState.user = result.authUser;
          authState.isLoggedIn = true;
          console.log('[Anime Tracker] Utilisateur restauré:', authState.user.email || authState.user.displayName);
          resolve(true);
        } else {
          resolve(false);
        }
      });
    });
  };

  // Définir un pseudo en mode local (sans Firebase)
  const setPseudo = async (pseudo) => {
    if (!pseudo || pseudo.trim().length === 0) {
      throw new Error('Le pseudo ne peut pas être vide');
    }

    const localUser = {
      uid: 'local_user_' + Date.now(),
      displayName: pseudo.trim(),
      isLocal: true
    };
    const localToken = 'local_token_' + Date.now();

    authState.isLoggedIn = true;
    authState.user = localUser;
    authState.token = localToken;

    chrome.storage.local.set({
      authToken: localToken,
      authUser: localUser,
      currentUser: localUser  // ✅ IMPORTANT: Sauvegarder currentUser!
    });

    console.log('[Anime Tracker] Pseudo défini (mode local):', pseudo);
    return { success: true, user: localUser, token: localToken };
  };

  const login = async (email, password) => {
    try {
      // Si connection désactivée, refuser le login
      if (!Config.isConnected()) {
        throw new Error('Connection désactivée - Utiliser setPseudo() à la place');
      }

      // Appel au background pour faire la requête Firebase
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'firebase-login',
          email,
          password
        }, response => {
          if (response.success) {
            authState.isLoggedIn = true;
            authState.user = response.user;
            authState.token = response.token;
            
            chrome.storage.local.set({
              authToken: response.token,
              authUser: response.user
            });
            
            console.log('[Anime Tracker] Connexion réussie:', email);
            resolve(response);
          } else {
            reject(new Error(response.error || 'Erreur de connexion'));
          }
        });
      });
    } catch (error) {
      console.error('[Anime Tracker] Erreur login:', error);
      throw error;
    }
  };

  const register = async (email, password, displayName) => {
    try {
      // Si connection désactivée, refuser le register
      if (!Config.isConnected()) {
        throw new Error('Connection désactivée - Utiliser setPseudo() à la place');
      }

      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'firebase-register',
          email,
          password,
          displayName
        }, response => {
          if (response.success) {
            authState.isLoggedIn = true;
            authState.user = response.user;
            authState.token = response.token;
            
            chrome.storage.local.set({
              authToken: response.token,
              authUser: response.user
            });
            
            console.log('[Anime Tracker] Inscription réussie:', email);
            resolve(response);
          } else {
            reject(new Error(response.error || 'Erreur d\'inscription'));
          }
        });
      });
    } catch (error) {
      console.error('[Anime Tracker] Erreur register:', error);
      throw error;
    }
  };

  const logout = async () => {
    return new Promise((resolve) => {
      chrome.storage.local.remove(['authToken', 'authUser'], () => {
        authState.isLoggedIn = false;
        authState.user = null;
        authState.token = null;
        
        if (OFFLINE_MODE) {
          console.log('[Anime Tracker] Déconnecté (mode offline)');
        } else {
          console.log('[Anime Tracker] Déconnecté');
        }
        
        resolve();
      });
    });
  };

  const isLoggedIn = () => authState.isLoggedIn;
  const getUser = () => authState.user;
  const getToken = () => authState.token;

  const resetPassword = async (email) => {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'firebase-reset-password',
        email
      }, response => {
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.error || 'Erreur'));
        }
      });
    });
  };

  return {
    init,
    login,
    register,
    logout,
    isLoggedIn,
    getUser,
    getToken,
    resetPassword,
    setPseudo
  };
})();
