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
      allow delete: if request.auth.uid == uid;
    }

    match /deletedAccounts/{uid} {
      allow read: if signedIn() && (request.auth.uid == uid || owner());
      allow create: if signedIn()
        && request.auth.uid == uid
        && request.resource.data.username is string;
      allow update, delete: if owner();
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
