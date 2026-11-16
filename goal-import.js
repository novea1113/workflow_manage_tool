'use strict';
const goalFieldNames = {title:'目標名稱',description:'目標說明',backend:'後端計畫',frontend:'前端計畫',release:'預計完成／訂版時程'};
function parseGoalWorksheet({get,maxRow,date}) {
  const aliases = {id:['目標id','年度目標id','id'],year:['年度','年份','year'],title:['目標名稱','項目','目標','title'],description:['目標說明','項目預期描述','項目說明','description'],backend:['後端計畫','後端','backend'],frontend:['前端計畫','前端','frontend'],release:['預計完成／訂版時程','預計完成/訂版時程','預計完成／訂版','預計完成時程','訂版時程','訂版','release']};
  const header = v => String(v ?? '').trim().toLowerCase();
  let columns = {}, headerRow = 0;
  for (let row=1;row<=maxRow;row++) {
    const found = {};
    for (let col=1;col<=60;col++) {
      const name = header(get(row,col));
      for (const [field,names] of Object.entries(aliases)) {
        if (names.includes(name)) {
          if (found[field]) throw Error('第 '+row+' 列有重複的「'+name+'」欄位');
          found[field] = col;
        }
      }
    }
    if (found.title && Object.keys(found).length >= 2) {columns=found;headerRow=row;break;}
  }
  if (!headerRow) throw Error('找不到目標欄位標題，請先使用「匯出目標 Excel」取得可更新的表格');
  const rows = [];
  for (let row=headerRow+1;row<=maxRow;row++) {
    // A visually empty row may inherit a merged date from the preceding goal.
    // It is not an additional goal row.
    if (Object.values(columns).every(col => !String(get(row,col) ?? '').trim())) continue;
    const record = {sourceRow:row};
    for (const [field,col] of Object.entries(columns)) {
      let value = get(row,col,true);
      if (field === 'release' && typeof value === 'number' && value >= 20000 && value < 150000) value = date(value);
      record[field] = value == null ? '' : String(value).replaceAll('\r\n','\n');
    }
    if (Object.keys(columns).every(k => !record[k].trim())) continue;
    if (!record.title.trim()) throw Error('第 '+row+' 列缺少目標名稱，請補齊後再匯入');
    record.title=record.title.trim();
    if (record.id !== undefined) record.id=record.id.trim();
    if (record.year) {
      record.year=record.year.trim().replace(/年$/, '');
      if (!/^\d{4}$/.test(record.year) || +record.year<1900 || +record.year>2200) throw Error('第 '+row+' 列的年度無效');
    }
    rows.push(record);
  }
  if (!rows.length) throw Error('此工作表沒有年度目標，尚未進行任何更新');
  return rows;
}
function planGoalImport(rows, year, replace) {
  const current = data.goals.filter(g=>g.year===year), changes=[], seen=new Set(), incomingIds=new Set();
  const selectedRows=rows.filter(r=>!r.year || r.year===year);
  if (!selectedRows.length) throw Error('檔案中沒有 '+year+' 年度的目標');
  for (const row of selectedRows) {
    let old;
    const sameTitle=current.filter(g=>g.title.trim()===row.title);
    if (row.id) {
      if (incomingIds.has(row.id)) throw Error('第 '+row.sourceRow+' 列的目標 ID 重複');
      incomingIds.add(row.id);
      const byId=data.goals.find(g=>g.id===row.id);
      if (byId && byId.year!==year) throw Error('第 '+row.sourceRow+' 列的目標 ID 屬於其他年度');
      old=byId;
      if (!old && sameTitle.length) throw Error('「'+row.title+'」的 ID 與現有目標不同，請重新匯出最新目標表格');
    } else {
      if (sameTitle.length>1) throw Error('「'+row.title+'」有多筆同名目標，請先匯出表格並保留目標 ID');
      old=sameTitle[0];
    }
    const identity=old?.id || row.id || 'new:'+row.title;
    if (seen.has(identity)) throw Error('「'+row.title+'」在檔案中重複，請先確認每個目標只列一次');
    seen.add(identity);
    const next=old?{...old}:{id:row.id||crypto.randomUUID(),year,title:'',description:'',backend:'',frontend:'',release:''};
    const fields=[];
    for (const name of Object.keys(goalFieldNames)) {
      if (row[name] !== undefined) {
        if (next[name] !== row[name]) fields.push({name,before:next[name]||'',after:row[name]});
        next[name]=row[name];
      }
    }
    changes.push({action:old?(fields.length?'update':'same'):'add',old,next,fields});
  }
  if (replace) for (const old of current) if (!changes.some(c=>c.old?.id===old.id)) changes.push({action:'delete',old,fields:[]});
  return {year,changes,skipped:rows.length-selectedRows.length};
}
// Export a real XLSX with inline text cells, preserving line breaks and stable IDs.
// ZIP entries use the standard stored method; no dependencies or CDN requests.
function goalExcelBlob(goals, year) {
  const xml = text => String(text ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  const headers=['年度','目標ID','目標名稱','目標說明','後端計畫','前端計畫','預計完成／訂版時程'];
  const table=[headers,...goals.map(g=>[year,g.id,g.title,g.description,g.backend,g.frontend,g.release])];
  const rowXML=table.map((r,i)=>`<row r="${i+1}">${r.map((v,j)=>`<c r="${String.fromCharCode(65+j)}${i+1}" t="inlineStr" s="1"><is><t xml:space="preserve">${xml(v)}</t></is></c>`).join('')}</row>`).join('');
  const files={
    '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    '_rels/.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml':'<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="年度目標" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    'xl/styles.xml':'<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
    'xl/worksheets/sheet1.xml':`<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="10" customWidth="1"/><col min="2" max="2" width="40" customWidth="1"/><col min="3" max="3" width="36" customWidth="1"/><col min="4" max="7" width="45" customWidth="1"/></cols><sheetData>${rowXML}</sheetData></worksheet>`
  };
  const encoder=new TextEncoder(), chunks=[],central=[];let offset=0;
  function crc32(bytes){let crc=-1;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^-1)>>>0;}
  for(const [name,text] of Object.entries(files)){
    const path=encoder.encode(name),body=encoder.encode(text),crc=crc32(body),local=new Uint8Array(30+path.length),lh=new DataView(local.buffer);
    lh.setUint32(0,0x04034b50,true);lh.setUint16(4,20,true);lh.setUint16(6,0x800,true);lh.setUint16(12,0x21,true);lh.setUint32(14,crc,true);lh.setUint32(18,body.length,true);lh.setUint32(22,body.length,true);lh.setUint16(26,path.length,true);local.set(path,30);
    const record=new Uint8Array(46+path.length),ch=new DataView(record.buffer);ch.setUint32(0,0x02014b50,true);ch.setUint16(4,20,true);ch.setUint16(6,20,true);ch.setUint16(8,0x800,true);ch.setUint16(14,0x21,true);ch.setUint32(16,crc,true);ch.setUint32(20,body.length,true);ch.setUint32(24,body.length,true);ch.setUint16(28,path.length,true);ch.setUint32(42,offset,true);record.set(path,46);central.push(record);chunks.push(local,body);offset+=local.length+body.length;
  }
  const end=new Uint8Array(22),eh=new DataView(end.buffer);eh.setUint32(0,0x06054b50,true);eh.setUint16(8,central.length,true);eh.setUint16(10,central.length,true);eh.setUint32(12,central.reduce((n,r)=>n+r.length,0),true);eh.setUint32(16,offset,true);
  return new Blob([...chunks,...central,end],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
function initGoalImport() {
  let plan=null,storageSnapshot=null,request=0;
  const message=text=>{$('#goalImportMessage').textContent=text;};
  function invalidate(){plan=null;$('#applyGoals').disabled=true;$('#goalImportPreview').innerHTML='';message('請按「預覽更新」檢查檔案與異動。');}
  $('#importGoals').onclick=()=>{
    $('#goalImportYear').innerHTML=yearOptions(activeYear);$('#goalImportFile').value='';$('#goalImportSheet').innerHTML='';$('#goalImportSheet').disabled=true;$('#replaceGoals').checked=false;invalidate();$('#goalImportEditor').showModal();
  };
  $('#goalImportFile').onchange=async()=>{
    const token=++request;invalidate();$('#goalImportSheet').innerHTML='';$('#goalImportSheet').disabled=true;
    try{
      const file=$('#goalImportFile').files[0];if(!file)return;if(!/\.xlsx$/i.test(file.name))throw Error('請選擇 .xlsx Excel 檔案');
      message('正在讀取 Excel 工作表…');const names=await importWorkExcel(file,{listSheets:true});if(token!==request)return;
      $('#goalImportSheet').innerHTML=names.map(n=>`<option>${esc(n)}</option>`).join('');
      const preferred=names.find(n=>n==='年度目標')||names.find(n=>n==='個人工作紀錄-'+$('#goalImportYear').value);
      if(preferred)$('#goalImportSheet').value=preferred;$('#goalImportSheet').disabled=false;message('請選擇目標工作表，再按「預覽更新」。');
    }catch(error){if(token===request)message('讀取失敗：'+error.message);}
  };
  for(const selector of ['#goalImportYear','#goalImportSheet','#replaceGoals'])$(selector).onchange=invalidate;
  $('#previewGoals').onclick=async()=>{
    const token=++request;invalidate();
    try{
      const file=$('#goalImportFile').files[0];if(!file||$('#goalImportSheet').disabled)throw Error('請先選擇 Excel 檔案與工作表');
      $('#previewGoals').disabled=true;message('正在比對目標…');
      const year=$('#goalImportYear').value,sheetName=$('#goalImportSheet').value,replace=$('#replaceGoals').checked;
      const rows=await importWorkExcel(file,{goalsOnly:true,sheetName});
      if(token!==request)return;
      if(year!==$('#goalImportYear').value||sheetName!==$('#goalImportSheet').value||replace!==$('#replaceGoals').checked){message('選項已變更，請重新預覽。');return;}
      plan=planGoalImport(rows,year,replace);storageSnapshot=localStorage.getItem(key);
      const count=action=>plan.changes.filter(c=>c.action===action).length;
      message(`${year} 年：新增 ${count('add')}、修改 ${count('update')}、不變 ${count('same')}、刪除 ${count('delete')} 項。${plan.skipped?'另有 '+plan.skipped+' 筆其他年度目標未納入。':''}`);
      const labels={add:'新增',update:'修改',same:'不變',delete:'刪除'};
      $('#goalImportPreview').innerHTML=`<table><thead><tr><th>動作</th><th>目標</th><th>內容變更</th></tr></thead><tbody>${plan.changes.map(c=>`<tr><td>${labels[c.action]}</td><td>${esc((c.next||c.old).title)}</td><td>${c.fields.map(f=>`<details><summary>${goalFieldNames[f.name]}</summary><div class="goal-diff"><p>原內容：${esc(f.before||'（空白）')}</p><p>新內容：${esc(f.after||'（空白）')}</p></div></details>`).join('')||(c.action==='delete'?'將移除此目標':'沒有欄位異動')}</td></tr>`).join('')}</tbody></table>`;
      $('#applyGoals').disabled=!plan.changes.some(c=>c.action!=='same');
    }catch(error){plan=null;message('無法預覽：'+error.message);}
    finally{$('#previewGoals').disabled=false;}
  };
  $('#applyGoals').onclick=()=>{
    if(!plan)return;
    try{
      if(localStorage.getItem(key)!==storageSnapshot)throw Error('資料已在其他分頁變更，請重新載入頁面後再匯入');
      const removed=plan.changes.filter(c=>c.action==='delete');
      if(removed.length&&!confirm(`將刪除 ${removed.length} 項 ${plan.year} 年度目標並套用預覽中的變更，確定繼續？`))return;
      const affected=new Set(plan.changes.filter(c=>c.old).map(c=>c.old.id));
      const goals=[...data.goals.filter(g=>!affected.has(g.id)),...plan.changes.filter(c=>c.action!=='delete').map(c=>c.next)];
      const next={...data,goals};localStorage.setItem(key,JSON.stringify(next));data=next;activeYear=plan.year;refreshSelectors();render();$('#goalImportEditor').close();toast('年度目標已批次更新');plan=null;
    }catch(error){message('尚未套用：'+error.message);}
  };
  $('#exportGoals').onclick=async()=>{
    try{
      const year=activeYear,goals=data.goals.filter(g=>g.year===year),blob=goalExcelBlob(goals,year);
      download('年度目標-'+year+'.xlsx',await blob.arrayBuffer(),blob.type);toast('已送出目標 Excel 下載要求，修改時請保留目標 ID');
    }catch(error){toast('匯出失敗：'+error.message);}
  };
}
