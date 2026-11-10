$ErrorActionPreference = 'Continue'
$root = 'D:\项目\ai思考可视化\dsh-workflow-monitor'
$ff = 'C:\Users\HW\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0.2-full_build\bin\ffmpeg.exe'
$py = 'C:\Users\HW\.dsh\dsh-runtimes\dsh-next-primary-runtime\dependencies\python\python.exe'
$tmp = $env:TEMP
$foot = Join-Path $root 'footage'
New-Item -ItemType Directory -Force -Path $foot | Out-Null

# --- 1. 采集三态 ---
$pyServer = Start-Process -FilePath $py -ArgumentList '-m','http.server','8791','--bind','127.0.0.1','--directory',$root -WindowStyle Hidden -PassThru
Start-Sleep -Seconds 2
$states = @(
  @{ name = 'run';  mode = 'run';  frames = 90 },
  @{ name = 'tool'; mode = 'run';  frames = 45 },
  @{ name = 'idle'; mode = 'idle'; frames = 90 }
)
foreach ($s in $states) {
  $out = Join-Path $foot ('cap-' + $s.name)
  if (Test-Path $out) { Remove-Item $out -Recurse -Force }
  $url = "http://127.0.0.1:8791/lab/host.html?mode=$($s.mode)&mock=history&clean=1"
  & node (Join-Path $root 'tools\capture.mjs') $url $out $s.frames 16.7 1920 1080 2>&1 | Select-Object -Last 1
}
Stop-Process -Id $pyServer.Id -Force -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -match '9333' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

# --- 2. PNG -> JPG（ffmpeg 对奇数高度敏感，PIL 转换顺带统一尺寸） ---
& $py -c @"
from PIL import Image
import glob, os
for name in ['run','tool','idle']:
    src = os.path.join(r'$foot', 'cap-' + name)
    dst = os.path.join(r'$tmp', 'j-' + name)
    os.makedirs(dst, exist_ok=True)
    fs = sorted(glob.glob(os.path.join(src, '*.png')))
    for i, f in enumerate(fs):
        Image.open(f).convert('RGB').save(os.path.join(dst, 'f%04d.jpg' % i), quality=94)
    print(name, len(fs))
"@

# --- 3. 分段编码 ---
function Seg($name, $input, $vfilter, $dur) {
  $args = @('-y')
  if ($input -like '*.jpg') { $args += @('-framerate','30','-i',$input) } else { $args += @('-loop','1','-t',$dur,'-i',$input) }
  $args += @('-vf', $vfilter, '-r','30','-c:v','libx264','-crf','16','-pix_fmt','yuv420p', (Join-Path $tmp "$name.mp4"))
  & $ff @args 2>&1 | Select-Object -Last 1
}

$card = Join-Path $tmp 'cards'
Seg 'v1' (Join-Path $card 'title.png') 'scale=1920:1080,fade=in:st=0:d=1.2' 4
Seg 'v2' (Join-Path $tmp 'j-run\f%04d.jpg') 'scale=1920:1080:flags=lanczos' 3
Seg 'v3' (Join-Path $tmp 'j-tool\f%04d.jpg') 'scale=1920:1080:flags=lanczos' 1.5
Seg 'v4' (Join-Path $tmp 'j-idle\f%04d.jpg') 'scale=1920:1080:flags=lanczos' 3
Seg 'v5' (Join-Path $card 'end.png') 'scale=1920:1080,fade=in:st=0.4:d=1.0' 5

$parts = @('v1','v2','v3','v4','v5') | ForEach-Object { Join-Path $tmp ($_ + '.mp4') }
$listFile = Join-Path $tmp 'concat.txt'
$lines = $parts | ForEach-Object { "file '" + ($_ -replace '\\','/') + "'" }
Set-Content -Path $listFile -Value $lines -Encoding ascii
$joined = Join-Path $tmp 'joined.mp4'
& $ff -y -f concat -safe 0 -i $listFile -c copy $joined 2>&1 | Select-Object -Last 1

# --- 4. 烧中文字幕 ---
$font = 'C:\Windows\Fonts\msyh.ttc'
$subs = @(
  @{ a = 4.6;  b = 7.2;  t = '这是一块给 AI 智能体做的仪器墙' },
  @{ a = 7.3;  b = 9.6;  t = '它此刻正在读你的会话' },
  @{ a = 9.7;  b = 12.0; t = '每一次工具调用，都会亮一下' },
  @{ a = 12.1; b = 14.6; t = '空闲时它慢下来，但不装忙' },
  @{ a = 14.7; b = 17.4; t = '42 小时的活动，越久越淡' }
)
$filters = @()
foreach ($s in $subs) {
  $txt = $s.t -replace '\\','\\\\' -replace ':','\:' -replace "'","’"
  $filters += "drawtext=fontfile='$($font)':text='$txt':fontcolor=0xE8EBF2:fontsize=44:x=(w-text_w)/2:y=h-170:enable='between(t,$($s.a),$($s.b))'"
}
$filterStr = $filters -join ','
$final = Join-Path $foot 'promo-16s.mp4'
& $ff -y -i $joined -vf $filterStr -c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p -movflags +faststart $final 2>&1 | Select-Object -Last 2

if ((Test-Path $final) -and ((Get-Item $final).Length -gt 0)) {
  Write-Output ('OK ' + [int]((Get-Item $final).Length/1KB) + 'KB')
  & $ff -i $final 2>&1 | Select-String 'Duration' | ForEach-Object { $_.Line.Trim() }
}
