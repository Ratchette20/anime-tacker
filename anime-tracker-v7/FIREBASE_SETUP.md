# Firebase — Structure complète v6.5

## Arborescence Firestore

```
firestore/
├── imageDatabase/
│   └── {titleKey}              ← images à corriger / confirmées
│
├── userAnimes/
│   └── {uid}/
│       └── animes/
│           └── {animeKey}/     ← animé (titre, image, épisodes, ...)
│               └── history/
│                   └── {ts}    ← historique de visionnage (≥5min)
│
├── issueReports/               ← signalements autres que images
│   └── {key}
│
├── styles/                     ⚠️ PRÉPARÉ — pas encore implémenté
│   └── {uid}                   ← CSS personnalisé par utilisateur
│
├── urlSites/                   ⚠️ PRÉPARÉ — pas encore implémenté
│   └── {site}                  ← URL active de chaque site (redirect)
│
└── extension/                  ⚠️ PRÉPARÉ — pas encore implémenté
    └── {version}               ← métadonnées de mise à jour
```

---

## `imageDatabase/{titleKey}`
Collection unique pour demandes ET corrections d'images.

**Clé** = `titre_minuscule_underscores` (+ `_s2` si saison > 1)

| Champ | Type | Description |
|---|---|---|
| title | string | Titre de l'animé |
| season | int | Numéro de saison |
| image | string | **Remplir ici** depuis la console Firebase |
| currentImage | string | Image actuelle (pour référence) |
| requestCount | int | Nombre de demandes |
| reported | bool | Signalé comme mauvaise image |
| requestedAt | int | Timestamp première demande |
| lastRequestAt | int | Timestamp dernière demande |

**Workflow :**
1. Extension détecte image manquante → crée `imageDatabase/titre` avec `image: ""`
2. Admin console Firebase → remplit `image` avec l'URL correcte
3. Cache local 10 min → tous les utilisateurs bénéficient automatiquement

---

## `userAnimes/{uid}/animes/{animeKey}`
Données de visionnage par animé.

| Champ | Type | Description |
|---|---|---|
| title | string | Titre (avec suffixe S2 si saison > 1) |
| image | string | URL image de couverture |
| sourceSite | string | anime-sama / franime / voiranime / adn / crunchyroll |
| lastSeen | int | Timestamp dernier visionnage |
| isFilm | bool | true si c'est un film |
| ep_{lang}_episode | int | Dernier épisode vu (par langue) |
| ep_{lang}_season | int | Saison correspondante |
| ep_{lang}_url | string | URL de l'épisode |
| ep_{lang}_lastSeen | int | Timestamp pour cette langue |
| totalEpisodes | int | Nombre total d'épisodes (si connu) |

### Sous-collection `history/{timestamp}`
Historique de visionnage — créé après 5 min sur une page.
Revisionnages acceptés (timestamp différent = nouveau document).

| Champ | Type | Description |
|---|---|---|
| title | string | Titre de l'animé |
| season | int | Numéro de saison |
| episode | int | Numéro d'épisode |
| lang | string | vf / vostfr / va / vo... |
| site | string | Nom du site |
| watchedAt | int | Timestamp de début du visionnage |
| date | string | "2026-04-14" |
| time | string | "21:30" |

---

## Règles Firestore
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    match /userAnimes/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    match /imageDatabase/{docId} {
      allow read: if true;
      allow write: if true; // l'extension écrit sans auth (demandes auto)
    }

    match /issueReports/{docId} {
      allow read, write: if true;
    }

    // Préparés pour plus tard
    match /styles/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    match /urlSites/{docId} {
      allow read: if true;
      allow write: if false; // admin uniquement
    }

    match /extension/{docId} {
      allow read: if true;
      allow write: if false; // admin uniquement
    }
  }
}
```

---

## Redirect automatique (rules.json)
Géré au niveau navigateur via `declarativeNetRequest`.
- anime-sama.to / anime-sama.pw → autorisés (pas redirigés)
- Tous autres anime-sama.* → redirigés vers anime-sama.to (chemin conservé)

**Toggle dans le profil :** ✅ coché = redirect activé
