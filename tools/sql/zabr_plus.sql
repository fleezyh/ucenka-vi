/* Расширенная витрина забраковки для сайта.

   Основа — SQL датасета 613 «3. АГ — Что признали браком на приёмке», один в
   один: те же джойны, тот же разбор дефекта, тот же год глубины. Добавлено
   ровно три вещи, которых на сайте не хватало:

     poluchatel  — полное имя точки, а не только её вид («Центр-ДМД» → что
                   конкретно за место). Уже был в датасете, просто не доезжал.
     sektor      — зона ячейки-источника: откуда товар приехал на забраковку.
                   Заполнен у 99,9 % актов, поэтому цепочку «дефект → место»
                   на нём строить можно.
     tovar/brand — номенклатура. В самих актах её нет, тянется через
                   dwh_nomenclature_guid → Dim_Product, как и группа товара.
     month_key   — календарный месяц акта, отдельно от недели. Складывать
                   месяц из недель нельзя: неделя с понедельником 31 августа
                   почти вся сентябрьская, и «август» на сайте получался в
                   тридцать пять дней. Неделя на стыке даёт здесь две строки,
                   и обе оси — недельная и месячная — сходятся с исходником.

   Забираем сырую грань; свод по неделям, вид точки и всё остальное считает
   сборщик и потом браузер.
*/
SELECT t.week_start_date, t.month_key, t.vid_tochki, t.region, t.poluchatel, t.sektor,
       t.napravlenie, t.gruppa, t.model_ucheta, t.tip_defekta,
       t.brand, t.artikul, t.tovar,
       COUNT(*)                          AS strok,
       CAST(SUM(t.rrc)   AS decimal(18,2)) AS rrc_rub,
       CAST(SUM(t.sebes) AS decimal(18,2)) AS sebes_rub
FROM (
    SELECT DATEADD(DAY, -(DATEDIFF(DAY, '19000101', a.date_time) % 7), CAST(a.date_time AS date)) AS week_start_date,
           CONVERT(varchar(7), a.date_time, 120) AS month_key,
           CASE WHEN z.name LIKE N'ДОМОДЕДОВО%' OR z.name LIKE N'ЧАШНИКОВО%' THEN N'МСК'
                WHEN z.name LIKE N'СЦ - %' THEN LTRIM(SUBSTRING(z.name, CHARINDEX(N' - ', z.name) + 3, 100))
                WHEN CHARINDEX(N' - ', z.name) > 0 THEN LEFT(z.name, CHARINDEX(N' - ', z.name) - 1)
                ELSE z.name END AS region,
           CASE WHEN z.name LIKE N'ДОМОДЕДОВО%' OR z.name LIKE N'ЧАШНИКОВО%' THEN N'Центр-ДМД'
                WHEN z.name LIKE N'СЦ%' THEN N'СЦ-регион'   WHEN z.name LIKE N'%РЦ%' THEN N'Регион-РЦ'
                WHEN z.name LIKE N'%Магазин-склад%' THEN N'МС' WHEN z.name LIKE N'%ПВЗ%' THEN N'ПВЗ'
                WHEN z.name LIKE N'%Магазин%' THEN N'ТТ'    WHEN z.name LIKE N'%Склад%' THEN N'Регион-склад'
                ELSE N'Прочее' END AS vid_tochki,
           ISNULL(z.name, N'(нет)')          AS poluchatel,
           ISNULL(zsrc.name, N'(нет)')       AS sektor,
           ISNULL(pr.napravlenie, N'(нет)')  AS napravlenie,
           ISNULL(pr.gruppa, N'(нет)')       AS gruppa,
           ISNULL(ram.name, N'(нет)')        AS model_ucheta,
           ISNULL(pr.brand, N'(нет)')        AS brand,
           ISNULL(CAST(pr.artikul AS varchar(20)), N'(нет)') AS artikul,
           ISNULL(pr.tovar, ISNULL(rs.name, N'(нет)'))       AS tovar,
           CASE
             WHEN a.claimed_defect LIKE N'%русском язык%' OR a.claimed_defect LIKE N'%нет русского%' OR a.claimed_defect LIKE N'%русского языка%'
               OR a.claimed_defect LIKE N'%нет дат%' OR a.claimed_defect LIKE N'%нет дате%' OR a.claimed_defect LIKE N'%стерта дата%'
               OR a.claimed_defect LIKE N'%стёрта дата%' OR a.claimed_defect LIKE N'%дата изготовл%' OR a.claimed_defect LIKE N'%маркировк%'
               OR a.claimed_defect LIKE N'%этикетк%' OR a.claimed_defect LIKE N'%штрихкод%' OR a.claimed_defect LIKE N'%штрих-код%'
               OR a.claimed_defect LIKE N'%нет информации%'
               THEN N'Нет маркировки'
             WHEN a.claimed_defect LIKE N'%некомплект%' OR a.claimed_defect LIKE N'%тсутств%' OR a.claimed_defect LIKE N'%комплект%'
               OR a.claimed_defect LIKE N'%не хватает%' OR a.claimed_defect LIKE N'%недостача%' OR a.claimed_defect LIKE N'%отсут%'
               OR a.claimed_defect LIKE N'%нет крышк%' OR a.claimed_defect LIKE N'%нет носик%' OR a.claimed_defect LIKE N'%нет ключ%'
               OR a.claimed_defect LIKE N'%нет насадк%' OR a.claimed_defect LIKE N'%нет инструкц%' OR a.claimed_defect LIKE N'%нет упаковк%'
               OR a.claimed_defect LIKE N'%нет детал%' OR a.claimed_defect LIKE N'%нет колес%' OR a.claimed_defect LIKE N'%нет ручк%'
               OR a.claimed_defect LIKE N'%нет болт%' OR a.claimed_defect LIKE N'%нет винт%' OR a.claimed_defect LIKE N'%нет гайк%'
               OR a.claimed_defect LIKE N'%нет шланг%' OR a.claimed_defect LIKE N'%нет фильтр%' OR a.claimed_defect LIKE N'%нет аккум%'
               OR a.claimed_defect LIKE N'%нет заряд%' OR a.claimed_defect LIKE N'%нет пульт%' OR a.claimed_defect LIKE N'%нет стекл%'
               OR a.claimed_defect LIKE N'%нет решетк%' OR a.claimed_defect LIKE N'%нет сетк%' OR a.claimed_defect LIKE N'%нет мешк%'
               OR a.claimed_defect LIKE N'%нет крепеж%' OR a.claimed_defect LIKE N'%нет крепл%' OR a.claimed_defect LIKE N'%нет заглуш%'
               OR a.claimed_defect LIKE N'%нет колпач%' OR a.claimed_defect LIKE N'%нет части%' OR a.claimed_defect LIKE N'%нет элемент%'
               OR a.claimed_defect LIKE N'%без крышк%' OR a.claimed_defect LIKE N'%без ручк%' OR a.claimed_defect LIKE N'%разукомплект%'
               OR a.claimed_defect LIKE N'%пустой%' OR a.claimed_defect LIKE N'%пустая%' OR a.claimed_defect LIKE N'%пусто%'
               OR a.claimed_defect LIKE N'%некомл%' OR a.claimed_defect LIKE N'%некомпл%' OR a.claimed_defect LIKE N'%кратност%'
               OR a.claimed_defect LIKE N'%1 из %' OR a.claimed_defect LIKE N'%2 из %' OR a.claimed_defect LIKE N'%1 шт%'
               OR a.claimed_defect LIKE N'%1шт%' OR a.claimed_defect LIKE N'%не полный%' OR a.claimed_defect LIKE N'%неполн%'
               THEN N'Некомплект'
             WHEN a.claimed_defect LIKE N'%срок годности%' OR a.claimed_defect LIKE N'%просрочен%' OR a.claimed_defect LIKE N'%просрочк%'
               OR a.claimed_defect LIKE N'%истек%' OR a.claimed_defect LIKE N'%истёк%' OR a.claimed_defect LIKE N'%истекл%'
               OR a.claimed_defect LIKE N'%истёкл%'
               THEN N'Истек срок годности'
             WHEN a.claimed_defect LIKE N'%разгерметиз%' OR a.claimed_defect LIKE N'%протек%' OR a.claimed_defect LIKE N'%протеч%'
               OR a.claimed_defect LIKE N'%течет%' OR a.claimed_defect LIKE N'%течёт%' OR a.claimed_defect LIKE N'%вытек%'
               OR a.claimed_defect LIKE N'%подтек%' OR a.claimed_defect LIKE N'%герметично%' OR a.claimed_defect LIKE N'%елостност%'
               OR a.claimed_defect LIKE N'%пролит%' OR a.claimed_defect LIKE N'%утечка%' OR a.claimed_defect LIKE N'%сыпет%'
               OR a.claimed_defect LIKE N'%просыпал%' OR a.claimed_defect LIKE N'%рассыпал%' OR a.claimed_defect LIKE N'%протёк%'
               OR a.claimed_defect LIKE N'%вскрыт%' OR a.claimed_defect LIKE N'%разрыв%'
               THEN N'Нарушение целостности'
             WHEN a.claimed_defect LIKE N'%упаковк%' OR a.claimed_defect LIKE N'%упак%' OR a.claimed_defect LIKE N'%коробк%'
               THEN N'Повреждение упаковки'
             WHEN a.claimed_defect LIKE N'%вмятин%' OR a.claimed_defect LIKE N'%сломан%' OR a.claimed_defect LIKE N'%лом%'
               OR a.claimed_defect LIKE N'%погнут%' OR a.claimed_defect LIKE N'%погнул%' OR a.claimed_defect LIKE N'%гнут%'
               OR a.claimed_defect LIKE N'%повреждени%' OR a.claimed_defect LIKE N'%повреждено%' OR a.claimed_defect LIKE N'%поврежден%'
               OR a.claimed_defect LIKE N'%повр%' OR a.claimed_defect LIKE N'%царап%' OR a.claimed_defect LIKE N'%скол%'
               OR a.claimed_defect LIKE N'%трещин%' OR a.claimed_defect LIKE N'%треснут%' OR a.claimed_defect LIKE N'%тресн%'
               OR a.claimed_defect LIKE N'%разбит%' OR a.claimed_defect LIKE N'%разрушен%' OR a.claimed_defect LIKE N'%мят%'
               OR a.claimed_defect LIKE N'%еформир%' OR a.claimed_defect LIKE N'%деформац%' OR a.claimed_defect LIKE N'%согнут%'
               OR a.claimed_defect LIKE N'%орван%' OR a.claimed_defect LIKE N'%оторв%' OR a.claimed_defect LIKE N'%залом%'
               OR a.claimed_defect LIKE N'%отертост%' OR a.claimed_defect LIKE N'%отёртост%' OR a.claimed_defect LIKE N'%потерт%'
               OR a.claimed_defect LIKE N'%потёрт%' OR a.claimed_defect LIKE N'%пополам%' OR a.claimed_defect LIKE N'%бой%'
               OR a.claimed_defect LIKE N'%бит%' OR a.claimed_defect LIKE N'%крив%' OR a.claimed_defect LIKE N'%продавлен%'
               OR a.claimed_defect LIKE N'%раздавлен%' OR a.claimed_defect LIKE N'%изъян%' OR a.claimed_defect LIKE N'%хрупк%'
               OR a.claimed_defect LIKE N'%мех%' OR a.claimed_defect LIKE N'%порез%' OR a.claimed_defect LIKE N'%рван%'
               OR a.claimed_defect LIKE N'%выщерб%' OR a.claimed_defect LIKE N'%надлом%' OR a.claimed_defect LIKE N'%трещ%'
               OR a.claimed_defect LIKE N'%щербин%'
               THEN N'Мех.Повреждение'
             WHEN a.claimed_defect LIKE N'%жавчин%' OR a.claimed_defect LIKE N'%ржав%' OR a.claimed_defect LIKE N'%рязн%'
               OR a.claimed_defect LIKE N'%товарн%' OR a.claimed_defect LIKE N'%таварн%' OR a.claimed_defect LIKE N'%залит%'
               OR a.claimed_defect LIKE N'%в краске%' OR a.claimed_defect LIKE N'%в масле%' OR a.claimed_defect LIKE N'%пыл%'
               OR a.claimed_defect LIKE N'%пятн%' OR a.claimed_defect LIKE N'%плесен%' OR a.claimed_defect LIKE N'%клей%'
               OR a.claimed_defect LIKE N'%потек крас%'
               THEN N'Не товарный вид'
             WHEN a.claimed_defect LIKE N'%не включается%' OR a.claimed_defect LIKE N'%не работает%' OR a.claimed_defect LIKE N'%не горит%'
               OR a.claimed_defect LIKE N'%не заводится%' OR a.claimed_defect LIKE N'%неисправ%' OR a.claimed_defect LIKE N'%не крутит%'
               OR a.claimed_defect LIKE N'%не держит%' OR a.claimed_defect LIKE N'%перегорел%' OR a.claimed_defect LIKE N'%не включ%'
               OR a.claimed_defect LIKE N'%сгорел%'
               THEN N'Не работает'
             WHEN a.claimed_defect LIKE N'%ересорт%' OR a.claimed_defect LIKE N'%не соответствует заявленному%' OR a.claimed_defect LIKE N'%другой товар%'
               THEN N'Пересорт'
             WHEN a.claimed_defect LIKE N'%следы эксплуатации%' OR a.claimed_defect LIKE N'%б/у%' OR a.claimed_defect LIKE N'%бывший в употреблении%'
               THEN N'Б/у'
             WHEN a.claimed_defect LIKE N'%гуманитар%'
               THEN N'Гуманитарная помощь'
             WHEN a.claimed_defect IS NULL OR a.claimed_defect = '' THEN N'Без указания дефекта'
             ELSE N'Прочие дефекты' END AS tip_defekta,
           a.price AS rrc,
           ISNULL(pr.price_vat, 0) / 1.22 AS sebes
    FROM DWH_VI.wms.doc_acceptance_act a
    LEFT JOIN DWH_VI.wms.ref_zone z                ON z.id  = a.receiver_id
    LEFT JOIN DWH_VI.wms.ref_sku rs                ON rs.id = a.sku_id
    LEFT JOIN DWH_VI.wms.ref_accounting_model ram  ON ram.id = rs.accounting_model_id
    LEFT JOIN DWH_VI.wms.ref_cell rcs              ON rcs.id = a.source_cell_id
    LEFT JOIN DWH_VI.wms.ref_zone zsrc             ON zsrc.id = rcs.zone_id
    LEFT JOIN (
        SELECT dng.sku_id,
               MAX(dp.[1401_Last_Supply_Price]) AS price_vat,
               MAX(dp.[9901_Name])              AS napravlenie,
               MAX(dp.[9902_Name])              AS gruppa,
               MAX(dp.[0302_Brand_Name])        AS brand,
               MAX(dp.[0102_Product_id])        AS artikul,
               MAX(dp.[0103_Product_Name])      AS tovar
        FROM DWH_VI.wms.dwh_nomenclature_guid dng
        JOIN dwh_olap.md.Dim_Product dp ON dp.[0101_Product_GUID] = dng.sku_guid
        GROUP BY dng.sku_id
    ) pr ON pr.sku_id = a.sku_id
    WHERE a.date_time >= DATEFROMPARTS(YEAR(DATEADD(MONTH, -12, GETDATE())), MONTH(DATEADD(MONTH, -12, GETDATE())), 1)
      AND a.appeal_type_id = 7
      AND a.status_id = 3
) t
GROUP BY t.week_start_date, t.month_key, t.vid_tochki, t.region, t.poluchatel, t.sektor,
         t.napravlenie, t.gruppa, t.model_ucheta, t.tip_defekta,
         t.brand, t.artikul, t.tovar
