$ErrorActionPreference = 'Continue'
$root = 'D:\项目\ai思考可视化\dsh-workflow-monitor'
$ff = 'C:\Users\HW\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0.2-full_build\bin\ffmpeg.exe'
$tmp = $env:TEMP
$foot = Join-Path $root 'footage'
$card = Join-Path $tmp 'cards'

function Make-Seg([string]$name, [string]$input, [string]$vfilter, [string]$dur) {
  $ffArgs = @('-y')
  if ($input -like '*%04d.jpg') {
    $ffArgs += @('-framerate', '30', '-i', $input)
  } else {
    $ffArgs += @('-loop', '1', '-t', $dur, '-i', $input)
  }
  $ffArgs += @('-vf', $vfilter, '-r', '30', '-c:v', 'libx264', '-crf', '16', '-pix_fmt', 'yuv420p', (Join-Path $tmp ($name + '.mp4')))
  & $ff @ffArgs 2>&1 | Select-Object -Last 1
}

$segs = @(
  @{ n = 'v1'; i = (Join-Path $card 'title.png');        f = 'scale=1920:1080,fade=in:st=0:d=1.2';  d = '4' },
  @{ n = 'v2'; i = (Join-Path $tmp 'j-run\f%04d.jpg');   f = 'scale=1920:1080:flags=lanczos';       d = '3' },
  @{ n = 'v3'; i = (Join-Path $tmp 'j-tool\f%04d.jpg');  f = 'scale=1920:1080:flags=lanczos';       d = '1.5' },
  @{ n = 'v4'; i = (Join-Path $tmp 'j-idle\f%04d.jpg');  f = 'scale=1920:1080:flags=lanczos';       d = '3' },
  @{ n = 'v5'; i = (Join-Path $card 'end.png');          f = 'scale=1920:1080,fade=in:st=0.4:d=1.0'; d = '5' }
)
foreach ($s in $segs) { Make-Seg $s.n $s.i $s.f $s.d }

$listFile = Join-Path $tmp 'concat.txt'
$lines = $segs | ForEach-Object { "file '" + ((Join-Path $tmp ($_.n + '.mp4')) -replace '\\','/') + "'" }
Set-Content -Path $listFile -Value $lines -Encoding ascii
$joined = Join-Path $tmp 'joined.mp4'
& $ff -y -f concat -safe 0 -i $listFile -c copy $joined 2>&1 | Select-Object -Last 1

$font = 'C:/Windows/Fonts/msyh.ttc'
$subs = @(
  @{ a = '4.6';  b = '7.2';  t = '这是一块给 AI 智能体做的仪器墙' },
  @{ a = '7.3';  b = '9.6';  t = '它此刻正在读你的会话' },
  @{ a = '9.7';  b = '12.0'; t = '每一次工具调用，都会亮一下' },
  @{ a = '12.1'; b = '14.6'; t = '空闲时它慢下来，但不装忙' },
  @{ a = '14.7'; b = '17.4'; t = '42 小时的活动，越久越淡' }
)
$filters = foreach ($s in $subs) {
  "drawtext=fontfile='$font':text='$($s.t)':fontcolor=0xE8EBF2:fontsize=44:x=(w-text_w)/2:y=h-160:enable='between(t,$($s.a),$($s.b))'"
}
$filterStr = ($filters -join ',')

$final = Join-Path $foot 'promo-17s.mp4'
& $ff -y -i $joined -vf $filterStr -c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p -movflags +faststart $final 2>&1 | Select-Object -Last 2
if ((Test-Path $final) -and ((Get-Item $final).Length -gt 0)) {
  Write-Output ('OK ' + [int]((Get-Item $final).Length/1KB) + 'KB')
} else {
  Write-Output '字幕版失败，输出无字幕版'
  & $ff -y -i $joined -c:v libx264 -crf 18 -pix_fmt yuv420p -movflags +faststart $final 2>&1 | Select-Object -Last 1
  if ((Get-Item $final).Length -gt 0) { Write-Output ('OK(no-subs) ' + [int]((Get-Item $final).Length/1KB) + 'KB') }
}
