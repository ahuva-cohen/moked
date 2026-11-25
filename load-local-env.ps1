function Import-LocalEnvironment {
  param([string]$Path)

  if (-not (Test-Path $Path -PathType Leaf)) { return }
  foreach ($line in Get-Content -Path $Path) {
    $line = $line.TrimStart([char]0xFEFF)
    if ($line -match '^\s*(#|$)') { continue }
    if ($line -notmatch '^\s*(GEMINI_API_KEY|GEMINI_MODEL|APP_PORT)\s*=\s*(.*?)\s*$') { continue }

    $name = $Matches[1]
    $value = $Matches[2].Trim()
    if ($value.Length -ge 2 -and
        (($value.StartsWith('"') -and $value.EndsWith('"')) -or
         ($value.StartsWith("'") -and $value.EndsWith("'")))) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    if ($name -eq "GEMINI_MODEL" -or -not [Environment]::GetEnvironmentVariable($name, "Process")) {
      [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
  }
}
