# Gắn số phiên bản ?v=... cho mọi file JS/CSS để trình duyệt luôn tải bản mới sau mỗi lần cập nhật code
# (tránh lỗi trình duyệt dùng file cũ trong cache, vd trang Thành viên không hiện nút Kích hoạt).
#
# Chạy từ thư mục gốc dự án, mỗi lần sửa JS/CSS:
#     powershell -ExecutionPolicy Bypass -File tools\set-asset-version.ps1
#
# Mọi import giữa các module dùng CÙNG một số phiên bản, nên mỗi module chỉ được tải 1 lần
# (không tạo 2 bản supabase client).
param([string]$Version = (Get-Date -Format 'yyyyMMddHHmm'))

$root = Split-Path -Parent $PSScriptRoot
$utf8 = New-Object Text.UTF8Encoding($false)
$changed = 0

function Update-File($path, $pattern, $replacement) {
  $text = [IO.File]::ReadAllText($path, [Text.Encoding]::UTF8)
  $updated = [regex]::Replace($text, $pattern, $replacement)
  if ($updated -ne $text) {
    [IO.File]::WriteAllText($path, $updated, $utf8)
    $script:changed++
  }
}

# import ... from './x.js'  ->  './x.js?v=VERSION'
Get-ChildItem (Join-Path $root 'js') -Filter *.js | ForEach-Object {
  Update-File $_.FullName "(from\s+'\./[\w-]+\.js)(\?v=[\w.-]+)?'" "`$1?v=$Version'"
}

# <script src="js/x.js">, <link href="css/x.css">  ->  ?v=VERSION
Get-ChildItem $root -Filter *.html | ForEach-Object {
  Update-File $_.FullName '((?:src|href)="(?:js/[\w-]+\.js|css/[\w-]+\.css))(\?v=[\w.-]+)?"' "`$1?v=$Version`""
}

Write-Output "Phiên bản tài nguyên: $Version ($changed file đã cập nhật)"
