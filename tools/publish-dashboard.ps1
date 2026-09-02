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

if ($SourceHtml) {
$SourceHtml = (Resolve-Path -LiteralPath $SourceHtml).Path
$content = [System.IO.File]::ReadAllText($SourceHtml)

if ($content -notmatch "Антигенерация брака" -or $content -notmatch "const\s+DATA\s*=") {
  throw "Файл не похож на дашборд антигенерации: $SourceHtml"
}

$content = [regex]::Replace(
  $content,
  "(?is)<title>.*?</title>",
  '<title>Дашборд · Антигенерация брака</title>',
  1
)

$headAddon = @'
<!-- SITE-SHELL-HEAD -->
<link rel="icon" type="image/svg+xml" href="../assets/brand/vi-mark.svg">
<script src="vendor/xlsx.full.min.js"></script>
<script src="dashboard-import.js" defer></script>
'@

$content = [regex]::Replace(
  $content,
  "(?i)</title>",
  "</title>`r`n$headAddon",
  1
)

$shellCss = @'
/* SITE-SHELL-STYLES */
.site-nav { max-width: 1280px; margin: 0 auto; padding: 12px 24px 0; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.site-nav__brand, .site-nav__back { color: var(--ink-2); text-decoration: none; font-family: "VI Sans", system-ui, sans-serif; font-size: 13px; }
.site-nav__brand { display: inline-flex; align-items: center; gap: 8px; font-weight: 700; }
.site-nav__brand img { width: 22px; height: 22px; border-radius: 6px; display: block; }
.site-nav__back { padding: 6px 10px; border: 1px solid var(--line); border-radius: 7px; background: var(--surface-2); }
.site-nav__back:hover { color: var(--ink); border-color: var(--line-2); }
.site-nav__actions { display: flex; align-items: center; gap: 8px; }
.data-button { border: 1px solid var(--line); border-radius: 7px; background: var(--surface-2); color: var(--ink); padding: 7px 11px; font: 700 12px "VI Sans", system-ui, sans-serif; cursor: pointer; }
.data-button:hover { border-color: var(--accent); }
.data-button.primary { color: #fff; background: var(--accent); border-color: var(--accent); }
.data-button.danger { color: var(--critical); }
.import-panel { max-width: 1280px; margin: 10px auto 0; padding: 0 24px; font-family: "VI Sans", system-ui, sans-serif; }
.import-panel[hidden] { display: none; }
.import-card { display: grid; grid-template-columns: 1fr auto; gap: 10px 18px; align-items: center; padding: 14px 16px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); box-shadow: var(--shadow); }
.import-title { margin: 0 0 3px; color: var(--ink); font-size: 15px; }
.import-hint, .import-status { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.45; }
.import-status { grid-column: 1 / -1; padding-top: 8px; border-top: 1px solid var(--line); }
.import-status.ok { color: var(--good); }
.import-status.error { color: var(--critical); }
.import-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.site-usage { max-width: 1280px; margin: 10px auto 0; padding: 0 24px; font-family: "VI Sans", system-ui, sans-serif; }
.site-usage[hidden] { display: none; }
.site-usage__row { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 16px; padding: 9px 14px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); color: var(--muted); font-size: 12px; }
.site-usage__title { color: var(--ink-2); font-weight: 700; }
.site-usage__item b { color: var(--ink); font-size: 14px; font-variant-numeric: tabular-nums; }
.site-usage__spark { display: inline-flex; align-items: flex-end; gap: 2px; height: 18px; margin-left: auto; }
.site-usage__spark i { width: 3px; min-height: 1px; border-radius: 1px; background: var(--accent); opacity: 0.65; }
.site-usage__stamp { color: var(--muted); font-size: 11px; }
@media (max-width: 720px) { .site-nav { padding-inline: 14px; } .site-nav__back { display: none; } .import-panel { padding-inline: 14px; } .import-card { grid-template-columns: 1fr; } .import-actions { justify-content: flex-start; } .site-usage { padding-inline: 14px; } .site-usage__spark { margin-left: 0; } }
'@

$content = [regex]::Replace(
  $content,
  "(?i)</style>",
  "$shellCss`r`n</style>`r`n<link rel=`"stylesheet`" href=`"dashboard-redesign.css?v=20260901-2`">",
  1
)

$content = $content.Replace(
  '<b>Черновик для обсуждения.</b> Страница статична: данные внутри, к базе не обращается.',
  '<b>Данные работают локально.</b> Свежие CSV и Excel можно загрузить кнопкой сверху; файлы никуда не отправляются.'
)

$shellHtml = @'
<!-- SITE-SHELL-START -->
<nav class="site-nav" aria-label="Навигация сайта">
  <a class="site-nav__brand" href="../"><img src="../assets/brand/vi-mark.svg" alt=""><span>Пикалка</span></a>
  <div class="site-nav__actions">
    <button class="data-button primary" id="import-open" type="button">Обновить данные</button>
    <a class="site-nav__back" href="../">← Уценка и предсорт</a>
  </div>
</nav>
<section class="import-panel" id="import-panel" hidden aria-label="Обновление данных">
  <div class="import-card">
    <div>
      <h2 class="import-title">Загрузить свежие выгрузки</h2>
      <p class="import-hint">CSV или Excel, один файл либо сразу несколько. Тип отчёта определяется автоматически; повторная загрузка заменяет его старые данные без дублей.</p>
    </div>
    <div class="import-actions">
      <input id="import-files" type="file" accept=".csv,.xlsx,.xls" multiple hidden>
      <button class="data-button primary" id="import-choose" type="button">Выбрать файлы</button>
      <button class="data-button danger" id="import-reset" type="button">Вернуть исходные</button>
      <button class="data-button" id="import-close" type="button">Закрыть</button>
    </div>
    <p class="import-status" id="import-status">Обновления сохраняются только в этом браузере. Исходные файлы никуда не отправляются.</p>
  </div>
</section>
<section class="site-usage" id="site-usage" hidden aria-label="Посещаемость">
  <div class="site-usage__row">
    <span class="site-usage__title">Заходили на сайт</span>
    <span class="site-usage__item"><b id="usage-day">—</b> за сутки</span>
    <span class="site-usage__item"><b id="usage-week">—</b> за неделю</span>
    <span class="site-usage__item"><b id="usage-month">—</b> за месяц</span>
    <span class="site-usage__spark" id="usage-spark" aria-hidden="true"></span>
    <span class="site-usage__stamp" id="usage-stamp"></span>
  </div>
</section>
<script src="usage.js?v=20260902-1" defer></script>
<!-- Аналитика вставляется здесь, а не в исходной выгрузке: иначе она пропадала
     при каждой перепубликации дашборда. Идентификатор публичный. -->
<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"85a2c48f22834923b7c34b931c8c514e"}'></script>
<!-- SITE-SHELL-END -->
'@

$bodyPattern = [regex]::new("(?i)<body([^>]*)>")
$content = $bodyPattern.Replace($content, { param($match) $match.Value + "`r`n" + $shellHtml }, 1)

New-Item -ItemType Directory -Force -Path $dashboardDir | Out-Null
[System.IO.File]::WriteAllText($dashboardFile, $content, [System.Text.UTF8Encoding]::new($false))

Write-Host "Дашборд обновлён из: $SourceHtml"
}
else {
  Write-Host "Используется текущая версия dashboard/index.html; передайте путь к HTML первым аргументом только для явной замены."
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
