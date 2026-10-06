@echo off
setlocal
cd /d "%~dp0"
echo Rebuilding inline account/community bundle...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p=(Get-Location).Path; $config=Get-Content (Join-Path $p 'assets/community/config.js') -Raw; $community=Get-Content (Join-Path $p 'assets/community/community.js') -Raw; $auth=Get-Content (Join-Path $p 'assets/community/auth-gate.js') -Raw; $htmlPath=Join-Path $p 'assets/index.html'; $html=Get-Content $htmlPath -Raw; $pattern='(?s)  <script>window\.UZ_ACCOUNT_DEBUG = window\.UZ_ACCOUNT_DEBUG \|\| \[\]; window\.UZ_ACCOUNT_DEBUG\.push\(''inline-account-bundle-start''\);</script>\s*<script data-inline=\"community/config\.js\">.*?</script>\s*<script data-inline=\"community/community\.js\">.*?</script>\s*<script data-inline=\"community/auth-gate\.js\">.*?</script>'; $bundle=@'\n  <script>window.UZ_ACCOUNT_DEBUG = window.UZ_ACCOUNT_DEBUG || []; window.UZ_ACCOUNT_DEBUG.push('inline-account-bundle-start');</script>\n  <script data-inline=\"community/config.js\">\n'@ + $config + @'\n  </script>\n  <script data-inline=\"community/community.js\">\n'@ + $community + @'\n  </script>\n  <script data-inline=\"community/auth-gate.js\">\n'@ + $auth + @'\n  </script>\n'@; $new=[regex]::Replace($html,$pattern,[System.Text.RegularExpressions.MatchEvaluator]{param($m)$bundle},1); if($new -eq $html){throw 'Inline bundle marker not found'}; [IO.File]::WriteAllText($htmlPath,$new.TrimEnd([char]13,[char]10)+[Environment]::NewLine)"
if errorlevel 1 goto :fail
node --check assets/community/auth-gate.js
if errorlevel 1 goto :fail
node --check assets/community/community.js
if errorlevel 1 goto :fail
git diff --check
if errorlevel 1 goto :fail
call push.bat
exit /b %errorlevel%
:fail
echo Build stopped. No push was made.
exit /b 1
