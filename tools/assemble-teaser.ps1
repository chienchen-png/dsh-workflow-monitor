$ErrorActionPreference = 'Stop'
$root = 'D:\项目\ai思考可视化\dsh-workflow-monitor'
$ff = 'C:\Users\HW\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0.2-full_build\bin\ffmpeg.exe'
$card = Join-Path $env:TEMP 'cards'
$frames = Join-Path $env:TEMP 'v1080'
$tmp = $env:TEMP

& $ff -y -loop 1 -t 4 -i (Join-Path $card 'title.png') -vf 'scale=1920:1080,fade=in:st=0:d=1.2,fade=out:st=3.4:d=0.6,format=yuv420p' -r 30 -c:v libx264 -crf 16 (Join-Path $tmp 's1.mp4') 2>&1 | Select-Object -Last 1

& $ff -y -framerate 30 -i (Join-Path $frames 'f%04d.jpg') -vf 'scale=1920:1080:flags=lanczos,fade=out:st=2.4:d=0.6,format=yuv420p' -r 30 -c:v libx264 -crf 16 (Join-Path $tmp 's2.mp4') 2>&1 | Select-Object -Last 1

& $ff -y -loop 1 -t 5 -i (Join-Path $card 'end.png') -vf 'scale=1920:1080,fade=in:st=0.4:d=1.0,format=yuv420p' -r 30 -c:v libx264 -crf 16 (Join-Path $tmp 's3.mp4') 2>&1 | Select-Object -Last 1

foreach ($i in 1,2,3) {
  $f = Join-Path $tmp ('s' + $i + '.mp4')
  if (Test-Path $f) { Write-Output ('  s' + $i + ': ' + [int]((Get-Item $f).Length/1KB) + 'KB') }
}

$list = Join-Path $tmp 'l.txt'
$lines = @('s1.mp4','s2.mp4','s3.mp4') | ForEach-Object { "file '" + ($tmp -replace '\\','/') + '/' + $_ + "'" }
Set-Content -Path $list -Value $lines -Encoding ascii

$outDir = Join-Path $root 'footage'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$final = Join-Path $outDir 'teaser-12s.mp4'
& $ff -y -f concat -safe 0 -i $list -c copy $final 2>&1 | Select-Object -Last 1
if ((Get-Item $final).Length -gt 0) { Write-Output ('OK teaser: ' + [int]((Get-Item $final).Length/1KB) + 'KB') }
