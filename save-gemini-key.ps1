$secureKey = Read-Host "Paste your NEW Gemini API key" -AsSecureString
if (-not $secureKey -or $secureKey.Length -eq 0) {
  throw "No API key was entered."
}

$keyDirectory = Join-Path $env:APPDATA "MokadSupport"
$keyFile = Join-Path $keyDirectory "gemini-key.dpapi"
New-Item -ItemType Directory -Path $keyDirectory -Force | Out-Null
$encryptedKey = ConvertFrom-SecureString $secureKey
[System.IO.File]::WriteAllText($keyFile, $encryptedKey)
$secureKey.Dispose()
Remove-Variable secureKey, encryptedKey
Write-Host "Encrypted Gemini key saved for this Windows account."
