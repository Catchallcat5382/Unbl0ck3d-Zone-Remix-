# Exact Firebase Setup for Unblocked Zone

Firebase is free on the Spark plan as long as you do not upgrade to Blaze. This setup uses Firebase Authentication and Cloud Firestore. No Render server, no Mongo server, and no credit card if you stay on Spark.

Firebase calls the login method **Email/Password**, but your site still shows **username/password**. The code silently turns a username into an internal fake email:

```text
billy41 -> billy41@uzlogin.net
```

Users do not type email.

## 1. Create The Firebase Project

1. Open https://console.firebase.google.com/
2. Click **Add project**.
3. Project name: `unblocked-zone`
4. Click **Continue**.
5. If it asks about Google Analytics, turn it **off**.
6. Click **Create project**.
7. Wait for it to finish.
8. Click **Continue**.

## 2. Keep It Free

1. In Firebase Console, check the plan near the bottom-left.
2. It should say **Spark**.
3. Do not click **Upgrade**.
4. Do not enable anything that asks for billing.

## 3. Add The Web App

1. On the Firebase project home page, click the web icon: `</>`.
2. App nickname: `Unblocked Zone`
3. Do not check Firebase Hosting.
4. Click **Register app**.
5. Firebase shows a `firebaseConfig` object.
6. Copy the values from that object.

## 4. Paste Config Into The Site

Open:

```text
assets/community/config.js
```

Find:

```js
firebaseConfig: {
  apiKey: '',
  authDomain: '',
  projectId: '',
  appId: ''
},
```

Paste your real values:

```js
firebaseConfig: {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  appId: 'YOUR_APP_ID'
},
```

Leave these like this:

```js
authProvider: 'firebase',
mongoApiUrl: '',
requireLogin: true,
```

## 5. Turn On Username/Password Login

Firebase calls this Email/Password. That is normal.

1. Firebase Console -> left sidebar -> **Build** -> **Authentication**.
2. Click **Get started**.
3. Click the **Sign-in method** tab.
4. Click **Email/Password**.
5. Turn on the first toggle: **Email/Password**.
6. Leave **Email link passwordless sign-in** off.
7. Click **Save**.

The website still asks for username. It uses the fake internal email automatically.

## 6. Create Firestore Database

1. Left sidebar -> **Build** -> **Firestore Database**.
2. Click **Create database**.
3. Choose **Start in production mode**.
4. Click **Next**.
5. Pick a location, for example `nam5 (United States)`.
6. Click **Enable**.

## 7. Paste Firestore Rules

1. In Firestore Database, click the **Rules** tab.
2. Delete everything in the editor.
3. Paste this exact ruleset:

```js
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() {
      return request.auth != null;
    }

    function myProfileDoc() {
      return get(/databases/$(database)/documents/profiles/$(request.auth.uid));
    }

    function myRole() {
      return signedIn() && myProfileDoc().data.role is string
        ? myProfileDoc().data.role
        : 'member';
    }

    function staff() {
      return myRole() in ['owner', 'admin', 'mod'];
    }

    function owner() {
      return myRole() == 'owner';
    }

    match /profiles/{uid} {
      allow read: if signedIn();

      allow create: if signedIn()
        && request.auth.uid == uid
        && request.resource.data.role == 'member'
        && request.resource.data.username is string;

      allow update: if signedIn() && (
        owner()
        || (
          request.auth.uid == uid
          && request.resource.data.role == resource.data.role
        )
      );

      allow delete: if owner() && request.auth.uid != uid;
    }

    match /messages/{id} {
      allow read: if signedIn();

      allow create: if signedIn()
        && request.resource.data.user_id == request.auth.uid
        && request.resource.data.body is string;

      allow update: if signedIn() && (
        owner()
        || myRole() == 'admin'
        || resource.data.user_id == request.auth.uid
      );

      allow delete: if owner() || myRole() == 'admin';
    }

    match /posts/{id} {
      allow read: if signedIn();

      allow create: if signedIn()
        && request.resource.data.user_id == request.auth.uid
        && request.resource.data.title is string
        && request.resource.data.body is string;

      allow update, delete: if signedIn() && (
        staff()
        || resource.data.user_id == request.auth.uid
      );
    }
  }
}
```

4. Click **Publish**.

If Firebase says the rules are invalid, check that you copied from `rules_version` through the final `}` exactly.

## 8. Push The Site

After pasting your Firebase config in `assets/community/config.js`, push the site again.

The login page should appear because:

```js
requireLogin: true
```

If the login page says the account service could not load, then either the Firebase config is still blank, Firebase SDK URLs are blocked, Authentication Email/Password is not enabled, or Firestore rules were not published.

## 9. Create Your Account

1. Open the site.
2. Click **Create account**.
3. Username: `billy41`
4. Password: anything 6+ characters.
5. Create the account.

It will start as `member`. That is intentional because client-side code cannot securely make itself owner.

## 10. Make Yourself Owner

1. Firebase Console -> **Build** -> **Firestore Database**.
2. Click **Data**.
3. Open the `profiles` collection.
4. Click the document for your account.
5. Find:

```text
role: "member"
```

6. Change it to:

```text
role: "owner"
```

7. Click **Update** or **Save**.
8. Refresh the site.

Now your account should show owner.

Why this manual owner step matters: if the website could make `billy41` owner by itself, anyone could inspect/edit the frontend and try to make themselves owner.

## 11. Test Checklist

1. Sign out.
2. Sign back in.
3. Open Community.
4. Send a chat message.
5. Create a post.
6. Open Members and confirm your role says owner.

## Collections

Firestore creates these automatically:

```text
profiles
messages
posts
```

You do not need to manually create them first.

## If Login Still Does Not Show

Check `assets/community/config.js`:

```js
authProvider: 'firebase',
mongoApiUrl: '',
requireLogin: true,
firebaseConfig: {
  apiKey: 'not blank',
  authDomain: 'not blank',
  projectId: 'not blank',
  appId: 'not blank'
}
```

Then rebuild/push the site.
