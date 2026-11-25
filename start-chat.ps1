$envLoader = Join-Path $PSScriptRoot "load-local-env.ps1"
. $envLoader
Import-LocalEnvironment -Path (Join-Path $PSScriptRoot ".env")

$port = if ($env:APP_PORT) { [int]$env:APP_PORT } else { 8081 }
$client = New-Object System.Net.Sockets.TcpClient
$portInUse = $false
try {
  $client.Connect("127.0.0.1", $port)
  $portInUse = $true
} catch [System.Net.Sockets.SocketException] {
} finally {
  $client.Close()
}
if ($portInUse) {
  Write-Error "Port $port already has a server running. Close its server window, then run this launcher again."
  Read-Host "Press Enter to close"
  exit 1
}

$keyFile = Join-Path $env:APPDATA "MokadSupport\gemini-key.dpapi"
if (-not $env:GEMINI_API_KEY) {
  if (-not (Test-Path $keyFile -PathType Leaf)) {
    & (Join-Path $PSScriptRoot "save-gemini-key.ps1")
  } else {
    $replaceKey = Read-Host "Press Enter to use the saved key, or type R to replace it"
    if ($replaceKey -match "^[Rr]$") {
      & (Join-Path $PSScriptRoot "save-gemini-key.ps1")
    }
  }

  $encryptedKey = Get-Content -Path $keyFile -Raw
  try {
    $secureKey = ConvertTo-SecureString $encryptedKey
  } catch {
    Write-Error "The saved key could not be decrypted for this Windows account. Use the update-key launcher to save it again."
    exit 1
  }

  $keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
  try {
    $env:GEMINI_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
    $secureKey.Dispose()
    Remove-Variable secureKey, keyPointer, encryptedKey
  }
}

$serverScript = Join-Path $PSScriptRoot "server.ps1"
$arguments = "-NoProfile -ExecutionPolicy Bypass -NoExit -File `"$serverScript`""
$serverProcess = Start-Process -FilePath "powershell.exe" -ArgumentList $arguments -PassThru
$serverReady = $false
for ($attempt = 0; $attempt -lt 20; $attempt++) {
  Start-Sleep -Milliseconds 500
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $client.Connect("127.0.0.1", $port)
    $serverReady = $true
    break
  } catch [System.Net.Sockets.SocketException] {
  } finally {
    $client.Close()
  }
  if ($serverProcess.HasExited) { break }
}
if (-not $serverReady) {
  Write-Error "The local server did not start. Check its PowerShell window."
  Read-Host "Press Enter to close"
  exit 1
}
Start-Process "http://localhost:$port"
