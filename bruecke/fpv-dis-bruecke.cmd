<# : FPV-Simulator - DIS-Bruecke. Doppelklick startet sie. Fenster offen lassen, solange geflogen wird.
@echo off
title FPV-DIS-Bruecke
powershell -NoProfile -ExecutionPolicy Bypass -Command "$f='%~f0'; iex ((Get-Content -LiteralPath $f -Raw))"
pause
exit /b
#>
# ---------------------------------------------------------------------------------------------------------------
# FPV-Simulator: Bruecke zwischen Browser und DIS (IEEE 1278.1, UDP). Nur Bordmittel von Windows (PowerShell 5.1).
# Der Simulator baut und liest die DIS-Pakete selbst; die Bruecke reicht sie nur durch:
#   Browser --WebSocket ws://localhost:8642 (binaer: DIS-PDU)--> Bruecke --UDP Broadcast :3000--> DIS-Netz
#   Browser <--(binaer: DIS-PDU)-------------------------------- Bruecke <--UDP :3000
# Dazu: Herzschlag (letzte PDU alle 5 s erneut, falls der Browser schweigt) und beim Trennen einmal "deaktiviert".
# Der Browser kann den DIS-Port aendern: Text {"t":"config","port":3000}.
# Einstellungen ueber Umgebungsvariablen (sonst Vorgaben): FPVB_PORT, FPVB_DISPORT, FPVB_TARGET, FPVB_HEARTBEAT (s),
# FPVB_TARGETPORT (nur Tests). Nur Verbindungen vom eigenen Rechner; nur Seiten des Simulators (GitHub Pages, lokale Datei).
# ---------------------------------------------------------------------------------------------------------------
$ErrorActionPreference = 'Stop'
function Env($n, $d) { $v = [Environment]::GetEnvironmentVariable($n); if ($v) { return $v } else { return $d } }
$Port = [int](Env 'FPVB_PORT' 8642)
$DisPort = [int](Env 'FPVB_DISPORT' 3000)
$Target = Env 'FPVB_TARGET' '255.255.255.255'
$FixTarget = [int](Env 'FPVB_TARGETPORT' 0)   # fester Zielport nur fuer Tests; sonst Zielport = DIS-Port
$Heart = [double](Env 'FPVB_HEARTBEAT' 5)
$Origins = @('null', 'https://bladeage.github.io', 'http://localhost', 'http://127.0.0.1')
function Log($t) { Write-Host ((Get-Date).ToString('HH:mm:ss') + '  ' + $t) }

# WebSocket-Server (http.sys, ohne Administrator nur "localhost")
function New-Listener($prefixes) { $h = New-Object System.Net.HttpListener; foreach ($p in $prefixes) { $h.Prefixes.Add($p) }; $h.Start(); return $h }
$http = $null
try { $http = New-Listener @("http://localhost:$Port/", "http://127.0.0.1:$Port/") } catch {
  try { $http = New-Listener @("http://localhost:$Port/") } catch { Log "Port $Port belegt oder gesperrt: $($_.Exception.Message)"; return }
}

# UDP: Port mit anderen DIS-Programmen teilen (ReuseAddress), Broadcast erlaubt
function Open-Udp($p) {
  $u = New-Object System.Net.Sockets.UdpClient
  $u.ExclusiveAddressUse = $false
  $u.Client.SetSocketOption([System.Net.Sockets.SocketOptionLevel]::Socket, [System.Net.Sockets.SocketOptionName]::ReuseAddress, $true)
  $u.Client.Bind((New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Any, $p)))
  $u.EnableBroadcast = $true
  return $u
}
function New-Dest { $tp = $(if ($script:FixTarget -gt 0) { $script:FixTarget } else { $script:DisPort }); return New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Parse($script:Target), $tp) }
$udp = Open-Udp $DisPort
$dest = New-Dest

Log "FPV-DIS-Bruecke laeuft: ws://localhost:$Port  |  DIS UDP $DisPort an $Target  |  Ende mit Strg+C oder Fenster schliessen"

$clients = New-Object System.Collections.ArrayList
$ctxTask = $http.GetContextAsync()
$udpTask = $udp.ReceiveAsync()
$sw = [Diagnostics.Stopwatch]::StartNew()

function Send-Text($c, $s) {
  $b = [Text.Encoding]::UTF8.GetBytes($s)
  try { $c.ws.SendAsync((New-Object System.ArraySegment[byte] -ArgumentList @(,$b)), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).Wait() } catch { $c.dead = $true }
}
function Send-Bin($c, [byte[]]$b) {
  try { $c.ws.SendAsync((New-Object System.ArraySegment[byte] -ArgumentList @(,$b)), [System.Net.WebSockets.WebSocketMessageType]::Binary, $true, [Threading.CancellationToken]::None).Wait() } catch { $c.dead = $true }
}
function Info-Text { return '{"t":"info","name":"fpv-dis-bruecke","version":2,"disPort":' + $script:DisPort + '}' }
function Start-Rx($c) { $c.seg = New-Object System.ArraySegment[byte] -ArgumentList @(,$c.buf); $c.rx = $c.ws.ReceiveAsync($c.seg, [Threading.CancellationToken]::None) }
# Letzte PDU als "deaktiviert" (Appearance Bit 23, Byte 85 Bit 7) und Vorhersage Static (Byte 88 = 1)
function Off-Pdu([byte[]]$p) { $q = [byte[]]$p.Clone(); if ($q.Length -ge 144) { $q[85] = $q[85] -bor 0x80; $q[88] = 1 }; return ,$q }
# DIS-Port wechseln (Wunsch des Browsers): neuer UDP-Kanal, alle Browser bekommen die neue Info
function Set-DisPort($p) {
  if ($p -eq $script:DisPort -or $p -lt 1 -or $p -gt 65535) { return }
  try { $n = Open-Udp $p } catch { Log "DIS-Port $p nicht moeglich: $($_.Exception.Message)"; return }
  try { $script:udp.Close() } catch { }
  $script:udp = $n; $script:DisPort = $p; $script:dest = New-Dest; $script:udpTask = $script:udp.ReceiveAsync()
  Log "DIS-Port jetzt $p"
  foreach ($c in $script:clients) { Send-Text $c (Info-Text) }
}

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
        Send-Text $c (Info-Text)
      } else {
        $ctx.Response.StatusCode = $(if ($ok) { 200 } else { 403 })
        $b = [Text.Encoding]::UTF8.GetBytes('FPV-DIS-Bruecke laeuft'); $ctx.Response.OutputStream.Write($b, 0, $b.Length); $ctx.Response.Close()
      }
      $ctxTask = $http.GetContextAsync()
    }
    # DIS aus dem Netz (und unser Echo) an alle Browser
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
                [void]$udp.Send($data, $data.Length, $dest)
                if ($data[2] -eq 1) { $c.last = $data; $c.lastT = $sw.Elapsed.TotalSeconds }   # Herzschlag nur aus Entity State (Typ 1)
              } elseif ($res.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Text) {
                $s = [Text.Encoding]::UTF8.GetString($data)
                if ($s -match '"t"\s*:\s*"config"' -and $s -match '"port"\s*:\s*(\d{1,5})') { Set-DisPort ([int]$Matches[1]) }
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
    Start-Sleep -Milliseconds 10
  }
} finally {
  foreach ($c in $clients) { if ($c.last) { $q = Off-Pdu $c.last; [void]$udp.Send($q, $q.Length, $dest) }; try { $c.ws.Abort() } catch { } }
  $udp.Close(); $http.Stop()
}
