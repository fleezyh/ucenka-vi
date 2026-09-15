param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^\d{4}-\d{2}$')]
    [string]$Month,
    [int]$ChunkSize = 2000000
)

$ErrorActionPreference = 'Stop'
$sqlq = 'E:\Work\Инструменты\sqlq.py'
$targetDir = "E:\Work\Выгрузки\$Month\cost-name-chunks"
New-Item -ItemType Directory -Force -Path $targetDir | Out-Null

for ($start = 0; $start -le 50000000; $start += $ChunkSize) {
    $finish = $start + $ChunkSize
    $target = Join-Path $targetDir ('cost-{0:D8}.csv' -f $start)
    if (Test-Path -LiteralPath $target) {
        Write-Host "Уже есть: $target"
        continue
    }

    Write-Host "Выгружаю коды $start-$finish"
    $query = @"
SELECT
    CAST(dp.[0102_Product_id] AS varchar(32)) AS [Код сайта],
    dp.[0104_Product_Full_Name] AS [Полное наименование],
    CAST(dp.[1401_Last_Supply_Price] / 1.22 AS decimal(18, 2)) AS [Себес]
FROM DWH_OLAP.md.Dim_Product AS dp WITH (NOLOCK)
WHERE dp.[0102_Product_id] >= $start
  AND dp.[0102_Product_id] < $finish
  AND NULLIF(LTRIM(RTRIM(dp.[0104_Product_Full_Name])), N'') IS NOT NULL
"@
    py $sqlq -q $query -d DWH_VI --csv $target --max-rows 0 --timeout 900
    if ($LASTEXITCODE -ne 0) {
        throw "Выгрузка диапазона $start-$finish завершилась с ошибкой"
    }
}
