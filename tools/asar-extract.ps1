# Extract files from an Electron asar archive by path.
# usage: asar-extract.ps1 -Asar <path> -OutDir <dir> -Paths 'a/b.md','c/d.js'
param(
  [Parameter(Mandatory = $true)][string]$Asar,
  [Parameter(Mandatory = $true)][string]$OutDir,
  [Parameter(Mandatory = $true)][string[]]$Paths
)

$fs = [System.IO.File]::OpenRead($Asar)
try {
  $b8 = New-Object byte[] 8
  $null = $fs.Read($b8, 0, 8)
  $hs = [BitConverter]::ToUInt32($b8, 4)
  $hdr = New-Object byte[] $hs
  $fs.Position = 8
  $null = $fs.Read($hdr, 0, $hs)
  $jsonLen = [BitConverter]::ToUInt32($hdr, 0)
  $json = [System.Text.Encoding]::UTF8.GetString($hdr, 4, $jsonLen)
  $cut = $json.IndexOf('{"files"')
  if ($cut -gt 0) { $json = $json.Substring($cut) }
  $root = ConvertFrom-Json $json

  New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

  foreach ($rel in $Paths) {
    $node = $root
    $ok = $true
    foreach ($seg in ($rel -split '/')) {
      $prop = $node.files.PSObject.Properties[$seg]
      if (-not $prop) { $ok = $false; break }
      $node = $prop.Value
    }
    if (-not $ok -or -not $node.size) { Write-Output "MISS $rel"; continue }

    $len = [int]$node.size
    $buf = New-Object byte[] $len
    $fs.Position = 8 + $hs + [long]$node.offset
    $read = 0
    while ($read -lt $len) {
      $r = $fs.Read($buf, $read, $len - $read)
      if ($r -le 0) { break }
      $read += $r
    }
    $dest = Join-Path $OutDir (($rel -replace '[\\/]', '__'))
    [System.IO.File]::WriteAllBytes($dest, $buf)
    Write-Output "OK   $rel -> $dest ($len bytes)"
  }
}
finally {
  $fs.Close()
}
