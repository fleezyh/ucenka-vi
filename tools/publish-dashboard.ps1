param(
  [Parameter(Position = 0)]
  [string]$SourceHtml,

  [switch]$NoPublish
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$dashboardDir = Join-Path $repoRoot "dashboard"
$dashboardFile = Join-Path $dashboardDir "index.html"

if (-not $SourceHtml -and -not (Test-Path -LiteralPath $dashboardFile)) {
  $downloadsDir = Join-Path ([Environment]::GetFolderPath("UserProfile")) "Downloads"
  $latest = Get-ChildItem -LiteralPath $downloadsDir -File -Filter "антигенерация*.html" |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

  if (-not $latest) {
    throw "В папке Загрузки не найден файл антигенерация*.html"
  }

  $SourceHtml = $latest.FullName
}

# Шапка и её стили определены до ветвления: они нужны обеим ветках —
# и при замене исходника, и при обновлении шапки на месте.
$shellCss = @'
/* SITE-SHELL-STYLES */
/* Тема фиксированно тёмная. В самой выгрузке дашборда светлая палитра стоит
   по умолчанию, а тёмная включается только при тёмной теме Windows — из-за
   этого у одних сотрудников сайт открывался белым, у других чёрным, причём
   остальные разделы светлого режима не знали вовсе. Блок идёт последним
   в <style>, поэтому перебивает и :root выгрузки, и её медиазапрос. */
:root { color-scheme: dark only; --bg: #12151A; --surface: #1C2126; --surface-2: #232830; --ink: #F5F5F5; --ink-2: #C9CDD3; --muted: #8B8B8B; --line: #2C333B; --line-2: #3A424C; --accent: #FF4438; --accent-soft: #3A1512; --steel: #4BA3F5; --plum: #C2E4FF; --teal: #6FB4F2; --critical: #FF4438; --good: #4BA3F5; --shadow: 0 1px 2px rgba(0,0,0,.4), 0 8px 24px -16px rgba(0,0,0,.7); }
.site-nav { max-width: 1280px; margin: 0 auto; padding: 12px 24px 0; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.site-nav__brand, .site-nav__back { color: var(--ink-2); text-decoration: none; font-family: "VI Sans", system-ui, sans-serif; font-size: 13px; }
.site-nav__brand { display: inline-flex; align-items: center; gap: 8px; font-weight: 700; }
.site-nav__brand img { width: 22px; height: 22px; border-radius: 6px; display: block; }
.site-nav__back { padding: 6px 10px; border: 1px solid var(--line); border-radius: 7px; background: var(--surface-2); }
.site-nav__back:hover { color: var(--ink); border-color: var(--line-2); }
.site-nav__actions { display: flex; align-items: center; gap: 8px; }
.site-nav__links { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.navGroup { display: flex; align-items: center; gap: 4px; padding: 5px 5px 5px 14px; border: 1px solid var(--line); border-radius: 15px; background: var(--surface-2); }
.navGroup__label { margin-right: 7px; color: var(--faint); font-size: 11px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; white-space: nowrap; }
.navLink { padding: 9px 15px; border-radius: 11px; color: var(--ink); font: 600 15px "VI Sans", system-ui, sans-serif; text-decoration: none; white-space: nowrap; }
.navLink:hover { background: rgba(255,255,255,.07); }
.navLink[aria-current="page"] { background: rgba(255,255,255,.12); color: #fff; }
.navAdmin { padding: 9px 15px; border: 1px solid rgba(240,93,114,.42); border-radius: 13px; color: #ffc0ca; background: rgba(240,93,114,.1); font: 600 15px "VI Sans", system-ui, sans-serif; text-decoration: none; white-space: nowrap; }
.navAdmin:hover { border-color: rgba(240,93,114,.75); background: rgba(240,93,114,.2); }
.site-nav__brand { font-size: 19px !important; }
.site-nav__brand img { width: 27px !important; height: 27px !important; }
@media (max-width: 760px) { .navGroup__label { display: none; } .navLink, .navAdmin { padding: 8px 12px; font-size: 14px; } }
@media (max-width: 720px) { .site-nav { padding-inline: 14px; } .site-nav__back { display: none; } }
/* Телефон. Шапка не помещалась в ширину экрана: группы ссылок не переносятся,
   и «Админка» уезжала за правый край, а страница получала горизонтальную
   прокрутку. Логотип встаёт своей строкой, ссылки — лентой с прокруткой. */
@media (max-width: 640px) {
.site-nav { flex-direction: column; align-items: stretch; gap: 10px; padding-inline: 12px; }
.site-nav__brand { justify-content: flex-start; }
.site-nav__actions { gap: 6px; flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; padding-bottom: 2px; }
.site-nav__actions::-webkit-scrollbar { display: none; }
.navGroup { flex: 0 0 auto; padding: 4px; }
.navAdmin { flex: 0 0 auto; }
/* Ширину задаёт экран, а не содержимое: иначе одна широкая таблица тянет
   вправо всю страницу. */
.wrap, .head-in { max-width: 100%; padding-inline: 12px; }
body { overflow-x: hidden; }
}
'@

$shellHtml = @'
<!-- SITE-SHELL-START -->
<div class="siteHeaderShell">
  <header class="topbar">
    <a class="brand" href="../" aria-label="Уценка — главная">
      <img class="brand__mark" src="../assets/brand/vi-mark.svg" alt="" width="27" height="27">
      <span>Уценка</span>
    </a>
    <nav class="siteNav" aria-label="Разделы сайта">
      <span class="navGroup">
        <span class="navGroup__label">Уценка</span>
        <a class="navLink" href="./" aria-current="page">Антигенерация</a>
        <a class="navLink" href="../heatmap/">Хитмап</a>
        <a class="navLink" href="../sales/">Продажи</a>
        <a class="navLink" href="../perf/">Производительность</a>
      </span>
      <span class="navGroup">
        <span class="navGroup__label">Инструменты</span>
        <a class="navLink" href="../picker/">Пикалка</a>
      </span>
      <a class="navAdmin" href="https://fleezy.tailb770fe.ts.net" target="_blank" rel="noopener">Админка</a>
    </nav>
  </header>
</div>
<script src="../nav.js?v=20260906-1" defer></script>
<!-- Аналитика вставляется здесь, а не в исходной выгрузке: иначе она пропадала
     при каждой перепубликации дашборда. Идентификатор публичный. -->
<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"907d91d4e2e044f682da0d451e684f83"}'></script>
<!-- SITE-SHELL-END -->
'@

function Set-SiteStyleLinks([string]$Html) {
  $Html = [regex]::Replace(
    $Html,
    '(?im)^[ \t]*<link rel="stylesheet" href="\.\./(?:reeded-bg|site-header)\.css\?v=[^"]+">[ \t]*\r?\n?',
    ''
  )
  $links = '<link rel="stylesheet" href="../reeded-bg.css?v=20260906-1">' + "`r`n" +
    '<link rel="stylesheet" href="../site-header.css?v=20260906-1">'
  return [regex]::Replace($Html, '(?i)</head>', "$links`r`n</head>")
}

if ($SourceHtml) {
$SourceHtml = (Resolve-Path -LiteralPath $SourceHtml).Path
$content = [System.IO.File]::ReadAllText($SourceHtml)

if ($content -notmatch "Антигенерация брака" -or $content -notmatch "const\s+DATA\s*=") {
  throw "Файл не похож на дашборд антигенерации: $SourceHtml"
}

$content = [regex]::Replace(
  $content,
  "(?is)<title>.*?</title>",
  '<title>Уценка · Антигенерация</title>',
  1
)

$headAddon = @'
<!-- SITE-SHELL-HEAD -->
<link rel="icon" type="image/svg+xml" href="../assets/brand/vi-mark.svg">
<script src="../reeded-bg.js?v=20260906-7" defer></script>
'@

$content = [regex]::Replace(
  $content,
  "(?i)</title>",
  "</title>`r`n$headAddon",
  1
)


$content = [regex]::Replace(
  $content,
  "(?i)</style>",
  "$shellCss`r`n</style>`r`n<link rel=`"stylesheet`" href=`"dashboard-redesign.css?v=20260901-2`">",
  1
)

$content = $content.Replace(
  '<b>Черновик для обсуждения.</b> Страница статична: данные внутри, к базе не обращается.',
  '<b>Данные обновляются автоматически.</b> Страница использует опубликованную выгрузку и к базе из браузера не обращается.'
)


$bodyPattern = [regex]::new("(?i)<body([^>]*)>")
$content = $bodyPattern.Replace($content, { param($match) $match.Value + "`r`n" + $shellHtml }, 1)
$content = Set-SiteStyleLinks $content

New-Item -ItemType Directory -Force -Path $dashboardDir | Out-Null
[System.IO.File]::WriteAllText($dashboardFile, $content, [System.Text.UTF8Encoding]::new($false))

Write-Host "Дашборд обновлён из: $SourceHtml"
}
else {
  # Исходник не передали — но шапку и её стили всё равно обновляем на месте.
  # Иначе правки навигации в этом скрипте доезжали бы до сайта только вместе с
  # новой выгрузкой дашборда, то есть практически никогда.
  $content = [System.IO.File]::ReadAllText($dashboardFile)
  $before = $content

  $content = [regex]::Replace($content, "(?is)<title>.*?</title>",
    '<title>Уценка · Антигенерация</title>', 1)

  if ($content -match "(?s)<!-- SITE-SHELL-START -->.*?<!-- SITE-SHELL-END -->") {
    $content = [regex]::Replace(
      $content,
      "(?s)<!-- SITE-SHELL-START -->.*?<!-- SITE-SHELL-END -->",
      { param($m) $shellHtml.Trim() },
      1
    )
  }

  if ($content -match "(?s)/\* SITE-SHELL-STYLES \*/.*?</style>") {
    $content = [regex]::Replace(
      $content,
      "(?s)/\* SITE-SHELL-STYLES \*/.*?</style>",
      { param($m) $shellCss.Trim() + "`r`n</style>" },
      1
    )
  }

  $content = Set-SiteStyleLinks $content

  if ($content -ne $before) {
    [System.IO.File]::WriteAllText($dashboardFile, $content, [System.Text.UTF8Encoding]::new($false))
    Write-Host "Шапка и стили обновлены в dashboard/index.html."
  }
  else {
    Write-Host "Используется текущая версия dashboard/index.html без изменений."
  }
}

if ($NoPublish) {
  Write-Host "Публикация пропущена (-NoPublish)."
  exit 0
}

Push-Location $repoRoot
try {
  $alreadyStaged = @(git diff --cached --name-only)
  if ($alreadyStaged.Count -gt 0) {
    throw "Перед публикацией уже есть подготовленные изменения Git. Сначала завершите их."
  }

  git add -- dashboard
  git diff --cached --quiet -- dashboard
  if ($LASTEXITCODE -eq 0) {
    Write-Host "Данные не изменились — публиковать нечего."
    exit 0
  }

  $stamp = Get-Date -Format "yyyy-MM-dd HH:mm"
  git commit -m "Update dashboard $stamp"
  if ($LASTEXITCODE -ne 0) { throw "Не удалось создать версию Git." }

  git push origin main
  if ($LASTEXITCODE -ne 0) { throw "Не удалось отправить обновление на GitHub." }

  Write-Host "Готово: https://ucenka-vi.ru/dashboard/"
}
finally {
  Pop-Location
}
