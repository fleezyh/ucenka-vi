/* Продажи в разрезах клиентского брака — знаменатель для долей.

   В основной выгрузке продажи есть только у тех товаров, по которым был
   возврат. Для доли категории этого мало: в знаменателе должна стоять вся
   категория, иначе доля завышается в разы — товары без единого возврата
   продавались, но в расчёт бы не попали.

   Разрезы считаем по отдельности и складываем в одну таблицу с колонкой
   `srez`: так строк в разы меньше, чем у декартова произведения, а странице
   ровно это и нужно — знаменатель на выбранное значение разреза.

   Периметр — только те значения, по которым брак был: остальные на странице
   не показываются, и продажи по ним не нужны.
*/
WITH granica AS (
    SELECT CAST(DATEADD(MONTH, -12, CAST(GETDATE() AS DATE)) AS DATE) AS s,
           CAST(GETDATE() AS DATE)                                    AS po
),
akty AS (
    SELECT DISTINCT aa.sku_id
    FROM DWH_VI.wms.doc_acceptance_act AS aa
    LEFT JOIN DWH_VI.wms.enum_appeal_type AS eat ON eat.id = aa.appeal_type_id
    CROSS JOIN granica AS g
    WHERE aa.date_time >= g.s AND aa.date_time < DATEADD(DAY, 1, g.po)
      AND aa.contractor_id IS NOT NULL
      AND (eat.full_name IS NULL
           OR eat.full_name NOT IN (N'Внутренний брак', N'Предпродажный брак', N'Брак поставщика'))
),
perimetr AS (
    /* Значения разрезов, которые вообще попадут на страницу. */
    SELECT DISTINCT
           dp.[5002_OR_Category_Name_1] AS kat1,
           dp.[5004_OR_Category_Name_2] AS kat2,
           dp.[5006_OR_Category_Name_3] AS kat3,
           dp.[0302_Brand_Name]         AS brend,
           dp.[2702_Supplier_Name]      AS postavshchik
    FROM akty AS a
    JOIN DWH_VI.wms.dwh_nomenclature_guid AS dng ON dng.sku_id = a.sku_id
    JOIN DWH_OLAP.md.Dim_Product AS dp ON dp.[0101_Product_GUID] = dng.sku_guid
),
prodazhi AS (
    /* Все продажи компании за окно с товарными атрибутами. */
    SELECT CONVERT(CHAR(7), CONVERT(DATE, CONVERT(CHAR(8), sm.doc_date), 112), 120) AS month_key,
           dp.[5002_OR_Category_Name_1] AS kat1,
           dp.[5004_OR_Category_Name_2] AS kat2,
           dp.[5006_OR_Category_Name_3] AS kat3,
           dp.[0302_Brand_Name]         AS brend,
           dp.[2702_Supplier_Name]      AS postavshchik,
           sm.Quantity                  AS sht,
           sm.price_com_wo_vat          AS rub
    FROM DWH_OLAP.tr.WTIS_Sales_mart AS sm
    JOIN DWH_OLAP.md.Dim_Product AS dp ON dp.dim_product_id = sm.dim_product_id
    /* Справочник каналов джойним по DISTINCT: на один подканал в нём
       несколько строк иерархии, и прямой джойн размножает продажи в
       десятки раз (июль: 1 236 млрд ₽ вместо 17). */
    JOIN (SELECT DISTINCT [0201_Sales_Sub-Channel_ID] AS channel_id
          FROM DWH_OLAP.md.dim_sales_channel
          WHERE [0102_Sales_Channel_Name] IN (N'B2B ABC', N'НИП', N'Первичка', N'Розница')) AS dsc
      ON dsc.channel_id = sm.channel_id
    CROSS JOIN granica AS g
    WHERE sm.doc_date >= CAST(CONVERT(CHAR(8), g.s, 112) AS INT)
      AND sm.doc_date <= CAST(CONVERT(CHAR(8), g.po, 112) AS INT)
      AND sm.Sale_Type IN (0, 1) AND sm.Product_Type = 1
)
SELECT srez, month_key, znachenie,
       CAST(SUM(sht) AS DECIMAL(18,2)) AS prodano_sht,
       CAST(SUM(rub) AS DECIMAL(18,2)) AS prodano_rub
FROM (
    SELECT 'kat1' AS srez, p.month_key, p.kat1 AS znachenie, p.sht, p.rub
    FROM prodazhi AS p
    WHERE EXISTS (SELECT 1 FROM perimetr AS m WHERE m.kat1 = p.kat1)
    UNION ALL
    SELECT 'kat2', p.month_key, p.kat2, p.sht, p.rub
    FROM prodazhi AS p
    WHERE EXISTS (SELECT 1 FROM perimetr AS m WHERE m.kat2 = p.kat2)
    UNION ALL
    SELECT 'kat3', p.month_key, p.kat3, p.sht, p.rub
    FROM prodazhi AS p
    WHERE EXISTS (SELECT 1 FROM perimetr AS m WHERE m.kat3 = p.kat3)
    UNION ALL
    SELECT 'brand', p.month_key, p.brend, p.sht, p.rub
    FROM prodazhi AS p
    WHERE EXISTS (SELECT 1 FROM perimetr AS m WHERE m.brend = p.brend)
    UNION ALL
    SELECT 'supplier', p.month_key, p.postavshchik, p.sht, p.rub
    FROM prodazhi AS p
    WHERE EXISTS (SELECT 1 FROM perimetr AS m WHERE m.postavshchik = p.postavshchik)
) AS vse
WHERE znachenie IS NOT NULL
GROUP BY srez, month_key, znachenie
