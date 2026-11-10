$ff = 'C:\Users\HW\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0.2-full_build\bin\ffmpeg.exe'
$T = $env:TEMP
$card = "$T\cards\title.png"
$endc = "$T\cards\end.png"
$run = "$T\j-run\f%04d.jpg"
$tool = "$T\j-tool\f%04d.jpg"
$idle = "$T\j-idle\f%04d.jpg"
$out = 'D:\项目\ai思考可视化\dsh-workflow-monitor\footage'

& $ff -y -loop 1 -t 4 -i $card -vf "scale=1920:1080,fade=in:st=0:d=1.2" -r 30 -c:v libx264 -crf 16 -pix_fmt yuv420p "$T\v1.mp4" 2>&1 | Select-Object -Last 1
& $ff -y -framerate 30 -i $run  -vf "scale=1920:1080:flags=lanczos" -r 30 -c:v libx264 -crf 16 -pix_fmt yuv420p "$T\v2.mp4" 2>&1 | Select-Object -Last 1
& $ff -y -framerate 30 -i $tool -vf "scale=1920:1080:flags=lanczos" -r 30 -c:v libx264 -crf 16 -pix_fmt yuv420p "$T\v3.mp4" 2>&1 | Select-Object -Last 1
& $ff -y -framerate 30 -i $idle -vf "scale=1920:1080:flags=lanczos" -r 30 -c:v libx264 -crf 16 -pix_fmt yuv420p "$T\v4.mp4" 2>&1 | Select-Object -Last 1
& $ff -y -loop 1 -t 5 -i $endc -vf "scale=1920:1080,fade=in:st=0.4:d=1.0" -r 30 -c:v libx264 -crf 16 -pix_fmt yuv420p "$T\v5.mp4" 2>&1 | Select-Object -Last 1

Get-ChildItem "$T\v*.mp4" | ForEach-Object { Write-Output ("  " + $_.Name + " " + [int]($_.Length/1KB) + "KB") }
