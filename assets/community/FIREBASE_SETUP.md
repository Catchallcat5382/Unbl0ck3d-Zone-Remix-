# Firebase Spark Setup for Unblocked Zone

This uses Firebase Authentication + Cloud Firestore on the Spark plan. Do not upgrade to Blaze if you want zero billing risk.

## 1. Create the Firebase Project

1. Go to https://console.firebase.google.com/
2. Click **Add project**.
3. Name it something simple, like `unblocked-zone`.
4. Turn Google Analytics off if it asks. You do not need it.
5. Create the project.

## 2. Add a Web App

1. In the Firebase project overview, click the web icon: `</>`.
2. Register the app as `Unblocked Zone`.
3. Copy the `firebaseConfig` object.
4. Open `assets/community/config.js`.
5. Paste only these values into `firebaseConfig`:

```js
firebaseConfig: {
  apiKey: 'PASTE_API_KEY',
  authDomain: 'PASTE_AUTH_DOMAIN',
  projectId: 'PASTE_PROJECT_ID',
  appId: 'PASTE_APP_ID'
},
```

Leave `authProvider: 'firebase'` and `mongoApiUrl: ''`.

## 3. Enable Email/Password Auth

1. Firebase Console -> **Build** -> **Authentication**.
2. Click **Get started**.
3. Go to **Sign-in method**.
4. Enable **Email/Password**.
5. Do not enable phone auth.

The site still shows usernames. Internally it turns `billy41` into `billy41@uzlogin.net`.

## 4. Create Firestore

1. Firebase Console -> **Build** -> **Firestore Database**.
2. Click **Create database**.
3. Choose **Start in production mode**.
4. Pick the nearest region.

## 5. Paste Firestore Rules

Firestore -> **Rules**, replace everything with this starter ruleset:

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() {
      return request.auth != null;
    }

    function profile() {
      return get(/databases/$(database)/documents/profiles/$(request.auth.uid)).data;
    }

    function staff() {
      return signedIn() && profile().role in ['owner', 'admin', 'mod'];
    }

    function owner() {
      return signedIn() && profile().role == 'owner';
    }

    match /profiles/{uid} {
      allow read: if signedIn();
      allow create: if signedIn() && request.auth.uid == uid;
      allow update: if signedIn() && (
        request.auth.uid == uid ||
        owner()
      );
      allow delete: if owner() && request.auth.uid != uid;
    }

    match /messages/{id} {
      allow read: if signedIn();
      allow create: if signedIn() && request.resource.data.user_id == request.auth.uid;
      allow update: if signedIn() && (
        resource.data.user_id == request.auth.uid ||
        profile().role in ['owner', 'admin']
      );
      allow delete: if profile().role in ['owner', 'admin'];
    }

    match /posts/{id} {
      allow read: if signedIn();
      allow create: if signedIn() && request.resource.data.user_id == request.auth.uid;
      allow update, delete: if signedIn() && (
        resource.data.user_id == request.auth.uid ||
        staff()
      );
    }
  }
}
```

## 6. First Owner Account

`assets/community/config.js` has:

```js
ownerUsernames: 'billy41'
```

The first created account is owner. Also, any username listed there becomes owner when its profile is first created. Add more owners as comma-separated usernames only if you trust them:

```js
ownerUsernames: 'billy41,aeroshift'
```

## 7. Test

1. Push the site.
2. Open the site.
3. If login is currently optional, set `requireLogin: true` in `assets/community/config.js` when you are ready to force accounts again.
4. Create the `billy41` account first.
5. Go to Community and send a test message.

If the page says Firebase is not connected, the SDK may be blocked or the config values are still blank.
