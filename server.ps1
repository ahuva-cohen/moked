$root = (Resolve-Path $PSScriptRoot).Path
Add-Type -AssemblyName System.Net.Http
. (Join-Path $PSScriptRoot "load-local-env.ps1")
Import-LocalEnvironment -Path (Join-Path $PSScriptRoot ".env")
$port = if ($env:APP_PORT) { $env:APP_PORT } else { "8081" }
$prefix = "http://localhost:$port/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Host "Server: $prefix"
Write-Host "Gemini model: $env:GEMINI_MODEL"

while ($listener.IsListening) {
  $context = $listener.GetContext()
  $responseSent = $false
  try {
    Import-LocalEnvironment -Path (Join-Path $PSScriptRoot ".env")
    $requestPath = [Uri]::UnescapeDataString($context.Request.Url.AbsolutePath)

    if ($requestPath -eq "/api/chat") {
      if ($context.Request.HttpMethod -ne "POST") {
        $context.Response.StatusCode = 405
        throw "Only POST is allowed."
      }

      if (-not $env:GEMINI_API_KEY) {
        $context.Response.StatusCode = 503
        throw "GEMINI_API_KEY is not configured on the server."
      }
      if ($context.Request.ContentLength64 -gt 65536) {
        $context.Response.StatusCode = 413
        throw "Request is too large."
      }

      $reader = New-Object System.IO.StreamReader($context.Request.InputStream, [System.Text.Encoding]::UTF8)
      $requestData = $reader.ReadToEnd() | ConvertFrom-Json
      $reader.Dispose()
      if (-not $requestData.messages -or $requestData.messages.Count -gt 20) {
        $context.Response.StatusCode = 400
        throw "Send between 1 and 20 chat messages."
      }

      $contents = @()
      foreach ($message in $requestData.messages) {
        if ($message.role -notin @("user", "assistant") -or -not $message.text -or $message.text.Length -gt 6000) {
          $context.Response.StatusCode = 400
          throw "Invalid chat message."
        }
        $role = if ($message.role -eq "assistant") { "model" } else { "user" }
        $contents += @{
          role = $role
          parts = @(@{ text = [string]$message.text })
        }
      }

      $model = if ($env:GEMINI_MODEL) { $env:GEMINI_MODEL } else { "gemini-3.1-flash-lite" }
      $systemText = "מקבל בעיה מהמשתמש ומנסה לעזור לו. היה מוקדן תמיכה אדיב ומעשי: שאל שאלות הבהרה כשצריך, הצע צעדים בטוחים וברורים, וענה בעברית אלא אם המשתמש פונה בשפה אחרת. אל תטען שביצעת פעולות שלא ביצעת."
      $payload = @{
        systemInstruction = @{ parts = @(@{ text = $systemText }) }
        contents = $contents
        tools = @(@{ googleSearch = @{} })
        generationConfig = @{
          temperature = 0.6
          thinkingConfig = @{ thinkingLevel = "MINIMAL" }
        }
      } | ConvertTo-Json -Depth 12

      [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
      $uri = "https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse"
      $httpClient = [System.Net.Http.HttpClient]::new()
      $apiRequest = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Post, $uri)
      $apiRequest.Headers.Add("x-goog-api-key", [string]$env:GEMINI_API_KEY)
      $apiRequest.Content = [System.Net.Http.StringContent]::new($payload, [Text.Encoding]::UTF8, "application/json")
      try {
        $apiResponse = $httpClient.SendAsync(
          $apiRequest,
          [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead
        ).GetAwaiter().GetResult()
        if (-not $apiResponse.IsSuccessStatusCode) {
          $apiError = $apiResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult()
          $apiErrorObject = $apiError | ConvertFrom-Json -ErrorAction SilentlyContinue
          $apiErrorMessage = if ($apiErrorObject.error.message) {
            [string]$apiErrorObject.error.message
          } else {
            "No error details were returned."
          }
          if ([int]$apiResponse.StatusCode -eq 429) {
            $context.Response.StatusCode = 429
            throw "מכסת השימוש ב-Gemini הסתיימה או הוגבלה. בדקי את המכסה והחיוב בפרויקט Google AI."
          }
          $context.Response.StatusCode = 502
          throw "Gemini API returned HTTP $([int]$apiResponse.StatusCode): $apiErrorMessage"
        }

        $context.Response.ContentType = "text/event-stream; charset=utf-8"
        $context.Response.SendChunked = $true
        $context.Response.Headers.Add("Cache-Control", "no-cache")
        $responseSent = $true
        $apiStream = $apiResponse.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
        $streamReader = [System.IO.StreamReader]::new($apiStream, [Text.Encoding]::UTF8)
        try {
          while ($null -ne ($line = $streamReader.ReadLine())) {
            if (-not $line.StartsWith("data:")) { continue }
            $data = $line.Substring(5).Trim()
            if (-not $data -or $data -eq "[DONE]") { continue }
            $chunk = $data | ConvertFrom-Json
            foreach ($candidate in $chunk.candidates) {
              foreach ($part in $candidate.content.parts) {
                if (-not $part.text) { continue }
                $eventJson = @{ text = [string]$part.text } | ConvertTo-Json -Compress
                $eventBytes = [Text.Encoding]::UTF8.GetBytes("data: $eventJson`n`n")
                $context.Response.OutputStream.Write($eventBytes, 0, $eventBytes.Length)
                $context.Response.OutputStream.Flush()
              }
            }
          }
          $doneBytes = [Text.Encoding]::UTF8.GetBytes("data: [DONE]`n`n")
          $context.Response.OutputStream.Write($doneBytes, 0, $doneBytes.Length)
          $context.Response.OutputStream.Flush()
        } catch {
          $streamError = @{ error = "Gemini stream failed: $($_.Exception.Message)" } | ConvertTo-Json -Compress
          $errorEvent = [Text.Encoding]::UTF8.GetBytes("event: error`ndata: $streamError`n`n")
          try {
            $context.Response.OutputStream.Write($errorEvent, 0, $errorEvent.Length)
            $context.Response.OutputStream.Flush()
          } catch {}
        } finally {
          $streamReader.Dispose()
        }
      } finally {
        if ($apiResponse) { $apiResponse.Dispose() }
        $apiRequest.Dispose()
        $httpClient.Dispose()
      }
    } else {
      if ($requestPath -eq "/") { $requestPath = "/index.html" }
      $fileName = [IO.Path]::GetFileName($requestPath)
      if ($requestPath -notin @("/index.html", "/app.js", "/styles.css")) {
        $context.Response.StatusCode = 404
        throw "Not found."
      }
      $file = Join-Path $root $fileName
      $extension = [IO.Path]::GetExtension($file).ToLower()
      switch ($extension) {
        ".html" { $context.Response.ContentType = "text/html; charset=utf-8" }
        ".css" { $context.Response.ContentType = "text/css; charset=utf-8" }
        ".js" { $context.Response.ContentType = "application/javascript; charset=utf-8" }
      }
      $bytes = [IO.File]::ReadAllBytes($file)
      $context.Response.ContentLength64 = $bytes.Length
      $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
      $responseSent = $true
    }
  } catch {
    if (-not $responseSent) {
      if ($context.Response.StatusCode -lt 400) { $context.Response.StatusCode = 502 }
      $errorBytes = [Text.Encoding]::UTF8.GetBytes((@{ error = $_.Exception.Message } | ConvertTo-Json -Compress))
      $context.Response.ContentType = "application/json; charset=utf-8"
      $context.Response.ContentLength64 = $errorBytes.Length
      try { $context.Response.OutputStream.Write($errorBytes, 0, $errorBytes.Length) } catch {}
    }
  }
  try { $context.Response.OutputStream.Close() } catch {}
}
