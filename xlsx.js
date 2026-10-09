/* Выгрузка таблицы в книгу Excel прямо из браузера.
 *
 * Книга .xlsx — это zip с несколькими XML внутри. Складываем его руками, без
 * сжатия (метод «store»): таблицы здесь на сотни строк, они весят копейки, зато
 * не нужна ни библиотека, ни сборка — сайт остаётся набором статических файлов.
 *
 * Наружу торчит одна функция: window.saveXlsx(строки, имяЛиста, имяФайла).
 * Строки — массив массивов; числа кладём числами, остальное текстом.
 */
(() => {
  "use strict";

  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      table[index] = value >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let index = 0; index < bytes.length; index += 1) {
      crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  /** Zip из готовых файлов: {name, bytes}. Без сжатия и без каталогов. */
  function zipStore(files) {
    const encoder = new TextEncoder();
    const chunks = [];
    const central = [];
    let offset = 0;

    const push = (...numbers) => Uint8Array.from(numbers);
    const short = (value) => push(value & 0xff, (value >>> 8) & 0xff);
    const long = (value) => push(value & 0xff, (value >>> 8) & 0xff,
                                 (value >>> 16) & 0xff, (value >>> 24) & 0xff);

    for (const file of files) {
      const name = encoder.encode(file.name);
      const body = file.bytes;
      const sum = crc32(body);
      const header = [push(0x50, 0x4b, 0x03, 0x04), short(20), short(0), short(0),
                      short(0), short(0), long(sum), long(body.length),
                      long(body.length), short(name.length), short(0), name];
      chunks.push(...header, body);
      const headerSize = header.reduce((acc, part) => acc + part.length, 0);

      central.push([push(0x50, 0x4b, 0x01, 0x02), short(20), short(20), short(0),
                    short(0), short(0), short(0), long(sum), long(body.length),
                    long(body.length), short(name.length), short(0), short(0),
                    short(0), short(0), long(0), long(offset), name]);
      offset += headerSize + body.length;
    }

    const directory = central.flat();
    const directorySize = directory.reduce((acc, part) => acc + part.length, 0);
    const end = [push(0x50, 0x4b, 0x05, 0x06), short(0), short(0),
                 short(files.length), short(files.length),
                 long(directorySize), long(offset), short(0)];
    return new Blob([...chunks, ...directory, ...end],
                    { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }

  const xmlEscape = (text) => String(text)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  /** Лист из массива строк: числа числами, остальное — текстом. */
  function sheetXml(rows) {
    const column = (index) => {
      let name = "";
      let value = index;
      do { name = String.fromCharCode(65 + (value % 26)) + name; value = Math.floor(value / 26) - 1; }
      while (value >= 0);
      return name;
    };
    const body = rows.map((row, rowIndex) => {
      const cells = row.map((value, cellIndex) => {
        const reference = `${column(cellIndex)}${rowIndex + 1}`;
        if (typeof value === "number" && Number.isFinite(value)) {
          return `<c r="${reference}"><v>${value}</v></c>`;
        }
        return `<c r="${reference}" t="inlineStr"><is><t>${xmlEscape(value ?? "")}</t></is></c>`;
      }).join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    }).join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
      + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
      + `<sheetData>${body}</sheetData></worksheet>`;
  }

  function buildWorkbook(listy) {
    const encoder = new TextEncoder();
    // Имя листа Excel не переваривает длиннее 31 знака и с рядом символов; повторять имя тоже нельзя.
    const zanyato = new Set();
    const imena = listy.map((l, i) => {
      let n = String(l.imya || `Лист${i + 1}`).replace(/[\\/:*?[\]]/g, " ").slice(0, 31) || `Лист${i + 1}`;
      while (zanyato.has(n.toLowerCase())) n = (n.slice(0, 27) + " " + (i + 1)).slice(0, 31);
      zanyato.add(n.toLowerCase());
      return n;
    });
    const files = [
      { name: "[Content_Types].xml", text:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
        + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
        + `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`
        + `<Default Extension="xml" ContentType="application/xml"/>`
        + `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`
        + listy.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")
        + `</Types>` },
      { name: "_rels/.rels", text:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
        + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
        + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>`
        + `</Relationships>` },
      { name: "xl/workbook.xml", text:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
        + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"`
        + ` xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`
        + `<sheets>${imena.map((n, i) => `<sheet name="${xmlEscape(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>`
        + `</workbook>` },
      { name: "xl/_rels/workbook.xml.rels", text:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
        + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
        + imena.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")
        + `</Relationships>` },
      ...listy.map((l, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, text: sheetXml(l.rows) })),
    ];
    return zipStore(files.map((file) => ({ name: file.name, bytes: encoder.encode(file.text) })));
  }

  /** Собрать книгу и отдать её пользователю файлом. */
  function skachat(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${fileName || "выгрузка"}.xlsx`.replace(/[\\/:*?"<>|]/g, "-");
    link.click();
    URL.revokeObjectURL(url);
  }

  window.saveXlsx = function saveXlsx(rows, sheetName, fileName) {
    skachat(buildWorkbook([{ imya: sheetName, rows }]), fileName || sheetName);
  };
  /** 09.10: книга из нескольких листов [{imya, rows}] — «одна выгрузка на все графики сразу». */
  window.saveXlsxKniga = function saveXlsxKniga(listy, fileName) {
    skachat(buildWorkbook(listy.filter((l) => l.rows && l.rows.length > 1)), fileName);
  };
})();
