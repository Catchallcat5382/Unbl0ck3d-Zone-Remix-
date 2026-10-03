# Unbl0cked Zone Login Notes

## Normal account flow
1. On the login screen, use **Sign in** if the account already exists.
2. Use **Create account** to make a new site-only account.
3. Usernames are converted internally into `username@uzlogin.net` because Supabase Auth requires an email-shaped ID.
4. Passwords are handled by Supabase Auth. They are not readable in the site code or admin UI.

## Owner unlock flow
- The public site does not explain the owner shortcut.
- Use the private key sequence on the login screen to open the owner-code modal.
- The owner unlock lasts only in the current browser tab because it uses `sessionStorage`.
- Closing the tab clears the temporary unlock.

## 32-character owner code setup
Do not paste the raw 32-character code into public files. Put its SHA-256 hash in `assets/community/config.js` as `ownerBypassHash`.

PowerShell hash command:

```powershell
$code = 'YOUR_32_CHARACTER_CODE_HERE'
$bytes = [System.Text.Encoding]::UTF8.GetBytes($code)
$hash = [System.Security.Cryptography.SHA256]::HashData($bytes)
-join ($hash | ForEach-Object { $_.ToString('x2') })
```

Paste the 64-character output here:

```js
ownerBypassHash: 'PASTE_HASH_HERE',
```

If the owner modal says `Wrong code`, the hash in config does not match the exact 32 characters typed into the modal.