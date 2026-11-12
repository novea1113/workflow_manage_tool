'use strict';
// Read the requested worksheet locally. No spreadsheet data leaves the browser.
async function importWorkExcel(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const zip = new DataView(bytes.buffer);
  const decoder = new TextDecoder('utf-8');
  if (bytes.length < 22) throw Error('不是有效的 .xlsx 檔案');
  let end = -1;
  for (let p = bytes.length - 22; p >= Math.max(0, bytes.length - 65557); p--) {
    if (zip.getUint32(p, true) === 0x06054b50 && p + 22 + zip.getUint16(p + 20, true) === bytes.length) { end = p; break; }
  }
  if (end < 0) throw Error('請選擇原始 Excel .xlsx 檔案，不支援 .xls 或加密檔案');
  const count = zip.getUint16(end + 10, true), entries = new Map();
  let cursor = zip.getUint32(end + 16, true);
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > bytes.length || zip.getUint32(cursor, true) !== 0x02014b50) throw Error('Excel 壓縮目錄損壞');
    const nameLength = zip.getUint16(cursor + 28, true), extraLength = zip.getUint16(cursor + 30, true), commentLength = zip.getUint16(cursor + 32, true);
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    entries.set(name, {
      method: zip.getUint16(cursor + 10, true), flags: zip.getUint16(cursor + 8, true),
      size: zip.getUint32(cursor + 24, true), compressedSize: zip.getUint32(cursor + 20, true), offset: zip.getUint32(cursor + 42, true)
    });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  const xmlNodes = (node, tag) => [...node.getElementsByTagNameNS('*', tag)];
  async function readXML(path, required = true) {
    const entry = entries.get(path);
    if (!entry) { if (!required) return null; throw Error('Excel 缺少必要內容：' + path); }
    if (entry.flags & 1) throw Error('不支援加密的 Excel 檔案');
    if (entry.size > 32 * 1024 * 1024) throw Error('Excel 分頁過大，請減少內容後再匯入');
    const pos = entry.offset;
    if (pos + 30 > bytes.length || zip.getUint32(pos, true) !== 0x04034b50) throw Error('Excel 檔案結構損壞');
    const start = pos + 30 + zip.getUint16(pos + 26, true) + zip.getUint16(pos + 28, true);
    if (start + entry.compressedSize > bytes.length) throw Error('Excel 檔案內容不完整');
    let raw = bytes.subarray(start, start + entry.compressedSize);
    if (entry.method === 8) {
      try {
        const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        raw = new Uint8Array(await new Response(stream).arrayBuffer());
      } catch { throw Error('無法解壓縮 Excel，請使用最新版 Chrome 或 Edge 開啟工具'); }
    } else if (entry.method !== 0) throw Error('不支援此 Excel 壓縮格式');
    if (raw.byteLength !== entry.size) throw Error('Excel 檔案大小驗證失敗');
    const doc = new DOMParser().parseFromString(decoder.decode(raw), 'application/xml');
    if (xmlNodes(doc, 'parsererror').length) throw Error('Excel XML 格式錯誤');
    return doc;
  }
  function resolvePart(base, target) {
    const path = target.startsWith('/') ? target.slice(1) : base.slice(0, base.lastIndexOf('/') + 1) + target;
    const parts = [];
    for (const piece of path.split('/')) {
      if (piece === '..') parts.pop(); else if (piece && piece !== '.') parts.push(piece);
    }
    return parts.join('/');
  }
  const workbookPath = 'xl/workbook.xml';
  const workbook = await readXML(workbookPath);
  const sheet = xmlNodes(workbook, 'sheet').find(s => s.getAttribute('name') === '個人工作紀錄-2026');
  if (!sheet) throw Error('找不到「個人工作紀錄-2026」分頁，請選擇原始紀錄試算表');
  const workbookRels = await readXML('xl/_rels/workbook.xml.rels');
  const relationId = sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || sheet.getAttribute('r:id');
  const relation = xmlNodes(workbookRels, 'Relationship').find(r => r.getAttribute('Id') === relationId);
  if (!relation || relation.getAttribute('TargetMode') === 'External') throw Error('Excel 分頁關聯無效');
  const sheetPath = resolvePart(workbookPath, relation.getAttribute('Target'));
  // Only this worksheet is opened; other worksheet content is never parsed.
  const sheetXML = await readXML(sheetPath);
  const sharedXML = await readXML('xl/sharedStrings.xml', false);
  const shared = sharedXML ? xmlNodes(sharedXML, 'si').map(s => xmlNodes(s, 't').map(t => t.textContent).join('')) : [];
  const cells = new Map(), merges = [];
  const coordinate = ref => {
    const match = /^([A-Z]+)(\d+)$/.exec(ref || '');
    if (!match) throw Error('Excel 儲存格位置無效');
    let col = 0; for (const c of match[1]) col = col * 26 + c.charCodeAt(0) - 64;
    return {row: Number(match[2]), col};
  };
  let maxRow = 0;
  for (const cell of xmlNodes(sheetXML, 'c')) {
    const ref = cell.getAttribute('r'), at = coordinate(ref), type = cell.getAttribute('t');
    const text = xmlNodes(cell, 'v')[0]?.textContent ?? '';
    let value = text;
    if (type === 's') value = shared[Number(text)] ?? '';
    else if (type === 'inlineStr') value = xmlNodes(cell, 't').map(t => t.textContent).join('');
    else if ((!type || type === 'n') && text !== '') value = Number(text);
    cells.set(ref, value); maxRow = Math.max(maxRow, at.row);
  }
  for (const merge of xmlNodes(sheetXML, 'mergeCell')) {
    const [first, last] = merge.getAttribute('ref').split(':');
    if (last) merges.push({first, start:coordinate(first), end:coordinate(last)});
  }
  function cellRef(row, col, merged = false) {
    let letters = '', n = col;
    while (n > 0) { letters = String.fromCharCode(65 + (n - 1) % 26) + letters; n = Math.floor((n - 1) / 26); }
    if (merged) {
      const range = merges.find(m => m.start.col === col && m.end.col === col && row >= m.start.row && row <= m.end.row);
      if (range) return range.first;
    }
    return letters + row;
  }
  const get = (row, col, merged = false) => cells.get(cellRef(row,col,merged)) ?? '';
  const clean = value => value == null || value === '-' ? '' : String(value);
  const date1904 = ['1', 'true'].includes(xmlNodes(workbook,'workbookPr')[0]?.getAttribute('date1904'));
  const date = value => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      const epoch = date1904 ? Date.UTC(1904,0,1) : Date.UTC(1899,11,30);
      return new Date(epoch + Math.floor(value) * 86400000).toISOString().slice(0,10);
    }
    const text = clean(value);
    return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0,10) : '';
  };
  const slash = sheetPath.lastIndexOf('/');
  const relsPath = sheetPath.slice(0,slash+1) + '_rels/' + sheetPath.slice(slash+1) + '.rels';
  const sheetRels = await readXML(relsPath, false), relationships = new Map(), hyperlinks = new Map();
  if (sheetRels) for (const r of xmlNodes(sheetRels,'Relationship')) relationships.set(r.getAttribute('Id'), r.getAttribute('Target'));
  for (const h of xmlNodes(sheetXML,'hyperlink')) {
    const id = h.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id') || h.getAttribute('r:id');
    hyperlinks.set(h.getAttribute('ref'), relationships.get(id) || '');
  }
  const url = (row,col,merged = false) => hyperlinks.get(cellRef(row,col,merged)) || '';
  if (clean(get(2,3)) !== '工項' || clean(get(2,8)) !== '狀態') throw Error('分頁欄位與原始紀錄格式不同，未匯入任何資料');
  let goalHeading = maxRow + 1;
  for (let row=3; row<=maxRow; row++) if (/工作項目目標/.test(clean(get(row,1)))) {goalHeading=row;break;}
  const result = {schemaVersion:2, years:['2026'], tasks:[],sprints:[],goals:[]};
  let sprint = '未分配';
  for (let row=3; row<goalHeading; row++) {
    const raw = clean(get(row,1)), match = /Sprint\s*(\d+)/i.exec(raw);
    if (match) {
      sprint = 'Sprint' + match[1];
      const cap = /點數[：:]\s*(\d+(?:\.\d+)?)/.exec(raw);
      result.sprints.push({name:sprint,year:'2026',capacity:cap?Number(cap[1]):0,label:raw});
    }
    const title = clean(get(row,3)); if (!title) continue;
    const points = get(row,2), status = clean(get(row,8)) || '待排程';
    result.tasks.push({id:'excel-task-'+row,year:'2026',title,sprint,points:typeof points==='number'?points:null,
      jira:clean(get(row,4)),document:clean(get(row,5,true)),start:date(get(row,6,true)),end:date(get(row,7,true)),status,
      notes:clean(get(row,9)),jiraUrl:url(row,4),docUrl:url(row,5,true),sourceRow:row});
  }
  for (let row=goalHeading+3; row<=maxRow; row++) {
    const title=clean(get(row,1));if(!title)continue;
    result.goals.push({id:'excel-goal-'+row,year:'2026',title,description:clean(get(row,3)),backend:clean(get(row,4)),frontend:clean(get(row,5)),release:clean(get(row,6))});
  }
  if (!result.tasks.length) throw Error('此分頁沒有可匯入的工作');
  return result;
}
