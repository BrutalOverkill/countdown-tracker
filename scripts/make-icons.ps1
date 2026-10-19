# Renders scripts/icon.svg to public/icons/icon-NxN.png using headless Edge + System.Drawing.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent
$svg = Get-Content (Join-Path $PSScriptRoot 'icon.svg') -Raw
$html = Join-Path $env:TEMP 'countdown-icon.html'
"<html><body style='margin:0;background:#000'>$svg</body></html>" | Set-Content $html -Encoding utf8
$big = Join-Path $env:TEMP 'countdown-icon-512.png'
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edge)) {
  throw "Microsoft Edge not found at $edge. Install Edge or render scripts/icon.svg to PNGs with any SVG tool; the PNGs in public/icons are committed, so CI never needs this script."
}
Start-Process -FilePath $edge -Wait -ArgumentList '--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=512,512', "--screenshot=$big", $html
$src = [System.Drawing.Image]::FromFile($big)
foreach ($size in 72, 96, 128, 144, 152, 180, 192, 384, 512) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.DrawImage($src, 0, 0, $size, $size)
  $bmp.Save((Join-Path $root "public\icons\icon-${size}x${size}.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}
$src.Dispose()
