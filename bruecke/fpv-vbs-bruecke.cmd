<# : FPV-Simulator - VBS-Bruecke (DIS). Doppelklick startet sie. Fenster offen lassen, solange geflogen wird.
@echo off
title FPV-VBS-Bruecke
powershell -NoProfile -ExecutionPolicy Bypass -Command "$f='%~f0'; iex ((Get-Content -LiteralPath $f -Raw))"
pause
exit /b
#>
# ---------------------------------------------------------------------------------------------------------------
# FPV-Simulator: Bruecke zwischen Browser und VBS (DIS ueber UDP). Nur Bordmittel von Windows (PowerShell 5.1).
# Der Simulator baut und liest die DIS-Pakete selbst; die Bruecke reicht sie nur durch:
#   Browser --WebSocket ws://localhost:8642 (binaer: DIS-PDU)--> Bruecke --UDP Broadcast :3000--> VBS Gateway
#   Browser <--(binaer: DIS-PDU) / (Text: Lagebild)----------- Bruecke <--UDP :3000 / Datei lagebild.txt
# Dazu: Herzschlag (letzte PDU alle 5 s erneut, falls der Browser schweigt) und beim Trennen einmal "deaktiviert".
# Einstellungen ueber Umgebungsvariablen (sonst Vorgaben): FPVB_PORT, FPVB_DISPORT, FPVB_TARGET, FPVB_LAGEBILD,
# FPVB_HEARTBEAT (s), FPVB_TARGETPORT (nur Tests). Nur Verbindungen vom eigenen Rechner; nur Seiten des Simulators (GitHub Pages, lokale Datei).
# ---------------------------------------------------------------------------------------------------------------
$ErrorActionPreference = 'Stop'
function Env($n, $d) { $v = [Environment]::GetEnvironmentVariable($n); if ($v) { return $v } else { return $d } }
$Port = [int](Env 'FPVB_PORT' 8642)
$DisPort = [int](Env 'FPVB_DISPORT' 3000)
$Target = Env 'FPVB_TARGET' '255.255.255.255'
$TargetPort = [int](Env 'FPVB_TARGETPORT' $DisPort)   # Zielport (Vorgabe wie der eigene; getrennt nur fuer Tests)
$Heart = [double](Env 'FPVB_HEARTBEAT' 5)
$LbPath = Env 'FPVB_LAGEBILD' ''
$Origins = @('null', 'https://bladeage.github.io', 'http://localhost', 'http://127.0.0.1')
function Log($t) { Write-Host ((Get-Date).ToString('HH:mm:ss') + '  ' + $t) }

# Lagebild des VBS-Moduls "lagebild" suchen: <VBS-Benutzerordner>\sqfkit_lagebild\lagebild.txt
function Find-Lagebild {
  if ($script:LbPath -and (Test-Path -LiteralPath $script:LbPath)) { return $script:LbPath }
  $docs = [Environment]::GetFolderPath('MyDocuments')
  if (-not $docs) { return $null }
  foreach ($c in @((Join-Path $docs 'VBS4\sqfkit_lagebild\lagebild.txt'), (Join-Path $docs 'VBS\sqfkit_lagebild\lagebild.txt'))) { if (Test-Path -LiteralPath $c) { return $c } }
  try { $d = Get-ChildItem -LiteralPath $docs -Directory -Recurse -Depth 3 -Filter 'sqfkit_lagebild' -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($d) { $f = Join-Path $d.FullName 'lagebild.txt'; if (Test-Path -LiteralPath $f) { return $f } } } catch { }
  return $null
}

# WebSocket-Server (http.sys, ohne Administrator nur "localhost")
function New-Listener($prefixes) { $h = New-Object System.Net.HttpListener; foreach ($p in $prefixes) { $h.Prefixes.Add($p) }; $h.Start(); return $h }
$http = $null
try { $http = New-Listener @("http://localhost:$Port/", "http://127.0.0.1:$Port/") } catch {
  try { $http = New-Listener @("http://localhost:$Port/") } catch { Log "Port $Port belegt oder gesperrt: $($_.Exception.Message)"; return }
}

# UDP: Port mit VBS teilen (ReuseAddress), Broadcast erlaubt
$udp = New-Object System.Net.Sockets.UdpClient
$udp.ExclusiveAddressUse = $false
$udp.Client.SetSocketOption([System.Net.Sockets.SocketOptionLevel]::Socket, [System.Net.Sockets.SocketOptionName]::ReuseAddress, $true)
$udp.Client.Bind((New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Any, $DisPort)))
$udp.EnableBroadcast = $true
$dest = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Parse($Target), $TargetPort)

Log "FPV-VBS-Bruecke laeuft: ws://localhost:$Port  |  DIS UDP $DisPort an $Target  |  Ende mit Strg+C oder Fenster schliessen"
$lb = Find-Lagebild
if ($lb) { Log "Lagebild: $lb" } else { Log 'Lagebild: nicht gefunden (Modul "lagebild" in VBS starten); Bewegung kommt dann nur aus DIS' }

$clients = New-Object System.Collections.ArrayList
$ctxTask = $http.GetContextAsync()
$udpTask = $udp.ReceiveAsync()
$lbTime = [DateTime]::MinValue
$lbNext = [DateTime]::Now
$sw = [Diagnostics.Stopwatch]::StartNew()

function Send-Text($c, $s) {
  $b = [Text.Encoding]::UTF8.GetBytes($s)
  try { $c.ws.SendAsync((New-Object System.ArraySegment[byte] -ArgumentList @(,$b)), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).Wait() } catch { $c.dead = $true }
}
function Send-Bin($c, [byte[]]$b) {
  try { $c.ws.SendAsync((New-Object System.ArraySegment[byte] -ArgumentList @(,$b)), [System.Net.WebSockets.WebSocketMessageType]::Binary, $true, [Threading.CancellationToken]::None).Wait() } catch { $c.dead = $true }
}
function Start-Rx($c) { $c.seg = New-Object System.ArraySegment[byte] -ArgumentList @(,$c.buf); $c.rx = $c.ws.ReceiveAsync($c.seg, [Threading.CancellationToken]::None) }
# Letzte PDU als "deaktiviert" (Appearance Bit 23, Byte 85 Bit 7) und Vorhersage Static (Byte 88 = 1)
function Off-Pdu([byte[]]$p) { $q = [byte[]]$p.Clone(); if ($q.Length -ge 144) { $q[85] = $q[85] -bor 0x80; $q[88] = 1 }; return ,$q }

try {
  while ($true) {
    # neue Verbindungen
    if ($ctxTask.IsCompleted) {
      $ctx = $ctxTask.Result
      $origin = $ctx.Request.Headers['Origin']; if (-not $origin) { $origin = 'null' }
      $ok = $false; foreach ($o in $Origins) { if ($origin -eq $o -or $origin.StartsWith($o + ':')) { $ok = $true } }
      if ($ctx.Request.IsWebSocketRequest -and $ok) {
        $wsc = $ctx.AcceptWebSocketAsync([NullString]::Value).Result   # echtes null (PowerShell macht aus $null einen leeren Text)
        $c = @{ ws = $wsc.WebSocket; buf = New-Object byte[] 65536; msg = New-Object System.IO.MemoryStream; last = $null; lastT = 0.0; dead = $false; rx = $null; seg = $null }
        Start-Rx $c; [void]$clients.Add($c)
        Log "Simulator verbunden ($($clients.Count))"
        Send-Text $c ('{"t":"info","name":"fpv-vbs-bruecke","version":1,"disPort":' + $DisPort + ',"lagebild":' + $(if ($lb) { 'true' } else { 'false' }) + '}')
        $lbTime = [DateTime]::MinValue
      } else {
        $ctx.Response.StatusCode = $(if ($ok) { 200 } else { 403 })
        $b = [Text.Encoding]::UTF8.GetBytes('FPV-VBS-Bruecke laeuft'); $ctx.Response.OutputStream.Write($b, 0, $b.Length); $ctx.Response.Close()
      }
      $ctxTask = $http.GetContextAsync()
    }
    # DIS von VBS (und unser Echo) an alle Browser
    while ($udpTask.IsCompleted) {
      try { $r = $udpTask.Result; foreach ($c in $clients) { Send-Bin $c $r.Buffer } } catch { }
      $udpTask = $udp.ReceiveAsync()
    }
    # Nachrichten der Browser
    foreach ($c in @($clients)) {
      if ($c.rx -and $c.rx.IsCompleted) {
        $res = $null; try { $res = $c.rx.Result } catch { $c.dead = $true }
        if ($res) {
          if ($res.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) { $c.dead = $true }
          else {
            $c.msg.Write($c.buf, 0, $res.Count)
            if ($res.EndOfMessage) {
              $data = $c.msg.ToArray(); $c.msg.SetLength(0)
              if ($res.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Binary -and $data.Length -ge 12) {
                [void]$udp.Send($data, $data.Length, $dest); $c.last = $data; $c.lastT = $sw.Elapsed.TotalSeconds
              }
            }
            if (-not $c.dead) { Start-Rx $c }
          }
        }
      }
      if (-not $c.dead -and $c.ws.State -ne [System.Net.WebSockets.WebSocketState]::Open) { $c.dead = $true }
      # Herzschlag: Browser schweigt (zum Beispiel Tab im Hintergrund), letzte PDU erneut senden
      if (-not $c.dead -and $c.last -and ($sw.Elapsed.TotalSeconds - $c.lastT) -ge $Heart) { [void]$udp.Send($c.last, $c.last.Length, $dest); $c.lastT = $sw.Elapsed.TotalSeconds }
      if ($c.dead) {
        if ($c.last) { $q = Off-Pdu $c.last; [void]$udp.Send($q, $q.Length, $dest) }
        try { $c.ws.Abort() } catch { }
        $clients.Remove($c); Log "Simulator getrennt ($($clients.Count))"
      }
    }
    # Lagebild jede Sekunde, nur wenn geaendert
    if ([DateTime]::Now -ge $lbNext) {
      $lbNext = [DateTime]::Now.AddSeconds(1)
      if (-not $lb) { $lb = Find-Lagebild; if ($lb) { Log "Lagebild gefunden: $lb" } }
      if ($lb -and $clients.Count -gt 0) {
        try {
          $t = (Get-Item -LiteralPath $lb).LastWriteTimeUtc
          if ($t -ne $lbTime) {
            $lbTime = $t
            $fs = New-Object System.IO.FileStream($lb, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
            $sr = New-Object System.IO.StreamReader($fs); $txt = $sr.ReadToEnd(); $sr.Close()
            $msg = @{ t = 'lagebild'; text = $txt } | ConvertTo-Json -Compress
            foreach ($c in $clients) { Send-Text $c $msg }
          }
        } catch { }
      }
    }
    Start-Sleep -Milliseconds 10
  }
} finally {
  foreach ($c in $clients) { if ($c.last) { $q = Off-Pdu $c.last; [void]$udp.Send($q, $q.Length, $dest) }; try { $c.ws.Abort() } catch { } }
  $udp.Close(); $http.Stop()
}
