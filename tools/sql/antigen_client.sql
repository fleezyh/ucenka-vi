/* Клиентский брак: что вернули покупатели и сколько этого продали.

   Задача Жени (сентябрь 2026): видеть топ по категории, наименованию, SKU и
   бренду, чтобы товар с высокой долей возвратов снимать с витрины сайта.
   Значит нужен не только объём, но и знаменатель — продажи того же товара.

   Клиентский контур = акты приёмки с контрагентом, кроме внутреннего брака,
   предпродажного и брака поставщика: там товар к покупателю не уезжал.
   Согласованный возврат и ремонтные виды обращения разделены отдельными
   мерами: вернули деньги за товар и принесли в сервис — разные истории.

   Зерно — месяц × SKU. Неделю не берём: возврат приходит с задержкой после
   продажи, и недельная доля скачет так, что по ней ничего не решить.

   Ловушки, на которых уже обожглись:
     · знаменатель джойнится по SKU сайта, а не по суррогату карточки — у
       товара несколько версий карточки, и продажи разлетаются по ним
       (WORX: находилось 266 штук вместо 11 741);
     · акт = одна единица товара, поэтому штуки — это COUNT(*), а не SUM(qty);
     · брак может оказаться больше продаж окна: возврат приходит по давней
       продаже или партию вернули разом. Это не ошибка расчёта, такие строки
       на странице помечаются отдельно.
*/
WITH granica AS (
    SELECT CAST(DATEADD(MONTH, -12, CAST(GETDATE() AS DATE)) AS DATE) AS s,
           CAST(GETDATE() AS DATE)                                    AS po
),
akty AS (
    SELECT CONVERT(CHAR(7), aa.date_time, 120) AS month_key,
           aa.sku_id,
           COUNT(*)                            AS brak_sht,
           SUM(CAST(ISNULL(aa.price, 0) AS DECIMAL(18,2))) AS brak_rub,
           SUM(CASE WHEN eat.full_name = N'Согласованный возврат' THEN 1 ELSE 0 END) AS vozvrat_sht,
           SUM(CASE WHEN eat.full_name IN (N'Гарантийный ремонт', N'Акт АСЦ', N'Платный ремонт',
                                           N'Диагностика', N'Ремонт', N'Ремонт 5 дней',
                                           N'Срочный ремонт') THEN 1 ELSE 0 END) AS remont_sht
    FROM DWH_VI.wms.doc_acceptance_act AS aa
    LEFT JOIN DWH_VI.wms.enum_appeal_type AS eat ON eat.id = aa.appeal_type_id
    CROSS JOIN granica AS g
    WHERE aa.date_time >= g.s AND aa.date_time < DATEADD(DAY, 1, g.po)
      AND aa.contractor_id IS NOT NULL
      AND (eat.full_name IS NULL
           OR eat.full_name NOT IN (N'Внутренний брак', N'Предпродажный брак', N'Брак поставщика'))
    GROUP BY CONVERT(CHAR(7), aa.date_time, 120), aa.sku_id
),
most AS (
    /* Мост склада и каталога. Проверено: на складской SKU приходится ровно
       один guid, поэтому MAX здесь ничего не теряет. */
    SELECT dng.sku_id, MAX(dng.sku_guid) AS sku_guid
    FROM DWH_VI.wms.dwh_nomenclature_guid AS dng
    WHERE dng.sku_id IN (SELECT DISTINCT sku_id FROM akty)
    GROUP BY dng.sku_id
),
tovar AS (
    SELECT m.sku_id,
           MAX(dp.[0102_Product_id])              AS sku_sayta,
           MAX(dp.[0103_Product_Name])            AS naimenovanie,
           MAX(dp.[0302_Brand_Name])              AS brend,
           MAX(dp.[2702_Supplier_Name])           AS postavshchik,
           MAX(dp.[5002_OR_Category_Name_1])      AS kategoriya_1,
           MAX(dp.[5004_OR_Category_Name_2])      AS kategoriya_2,
           MAX(dp.[5006_OR_Category_Name_3])      AS kategoriya_3
    FROM most AS m
    JOIN DWH_OLAP.md.Dim_Product AS dp ON dp.[0101_Product_GUID] = m.sku_guid
    GROUP BY m.sku_id
),
prodazhi AS (
    /* Знаменатель: продажи тех же товаров по основным каналам компании. */
    SELECT CONVERT(CHAR(7), CONVERT(DATE, CONVERT(CHAR(8), sm.doc_date), 112), 120) AS month_key,
           dp.[0102_Product_id]      AS sku_sayta,
           SUM(sm.Quantity)          AS prodano_sht,
           SUM(sm.price_com_wo_vat)  AS prodano_rub
    FROM DWH_OLAP.tr.WTIS_Sales_mart AS sm
    JOIN DWH_OLAP.md.Dim_Product AS dp ON dp.dim_product_id = sm.dim_product_id
    /* Справочник каналов джойним по DISTINCT: на один подканал в нём
       несколько строк иерархии, и прямой джойн размножает продажи в
       десятки раз (июль: 1 236 млрд ₽ вместо 17). */
    JOIN (SELECT DISTINCT [0201_Sales_Sub-Channel_ID] AS channel_id
          FROM DWH_OLAP.md.dim_sales_channel
          WHERE [0102_Sales_Channel_Name] IN (N'B2B ABC', N'НИП', N'Первичка', N'Розница')) AS dsc
      ON dsc.channel_id = sm.channel_id
    JOIN (SELECT DISTINCT sku_sayta FROM tovar WHERE sku_sayta IS NOT NULL) AS t
      ON t.sku_sayta = dp.[0102_Product_id]
    CROSS JOIN granica AS g
    WHERE sm.doc_date >= CAST(CONVERT(CHAR(8), g.s, 112) AS INT)
      AND sm.doc_date <= CAST(CONVERT(CHAR(8), g.po, 112) AS INT)
      AND sm.Sale_Type IN (0, 1) AND sm.Product_Type = 1
    GROUP BY CONVERT(CHAR(7), CONVERT(DATE, CONVERT(CHAR(8), sm.doc_date), 112), 120),
             dp.[0102_Product_id]
),
kompaniya AS (
    /* Продажи компании целиком — второй знаменатель. Доля товара в своих
       продажах отвечает на вопрос «снимать ли его с витрины», а доля в
       продажах компании — это тот самый процент, который идёт в отчётность. */
    SELECT CONVERT(CHAR(7), CONVERT(DATE, CONVERT(CHAR(8), sm.doc_date), 112), 120) AS month_key,
           SUM(sm.Quantity)          AS vsego_sht,
           SUM(sm.price_com_wo_vat)  AS vsego_rub
    FROM DWH_OLAP.tr.WTIS_Sales_mart AS sm
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
    GROUP BY CONVERT(CHAR(7), CONVERT(DATE, CONVERT(CHAR(8), sm.doc_date), 112), 120)
)
SELECT a.month_key,
       CAST(ISNULL(t.sku_sayta, a.sku_id) AS VARCHAR(20))     AS sku,
       ISNULL(t.naimenovanie, N'—')                           AS tovar,
       ISNULL(t.brend, N'—')                                  AS brend,
       ISNULL(t.postavshchik, N'—')                           AS postavshchik,
       ISNULL(t.kategoriya_1, N'—')                           AS kat1,
       ISNULL(t.kategoriya_2, N'—')                           AS kat2,
       ISNULL(t.kategoriya_3, N'—')                           AS kat3,
       a.brak_sht,
       a.vozvrat_sht,
       a.remont_sht,
       CAST(a.brak_rub AS DECIMAL(18,2))                      AS brak_rub,
       CAST(ISNULL(p.prodano_sht, 0) AS DECIMAL(18,2))        AS prodano_sht,
       CAST(ISNULL(p.prodano_rub, 0) AS DECIMAL(18,2))        AS prodano_rub,
       CAST(k.vsego_sht AS DECIMAL(18,2))                     AS kompaniya_sht,
       CAST(k.vsego_rub AS DECIMAL(18,2))                     AS kompaniya_rub
FROM akty AS a
LEFT JOIN tovar AS t ON t.sku_id = a.sku_id
LEFT JOIN prodazhi AS p ON p.sku_sayta = t.sku_sayta AND p.month_key = a.month_key
LEFT JOIN kompaniya AS k ON k.month_key = a.month_key
