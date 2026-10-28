import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import type { Attachment } from '../types';

type Report = { token: string; source: string; assets: number; images: number; attachments: number; accessories: number; sold: number; retired: number; wishes: number; warnings: string[]; items: {id:string; name:string; price:number; status:string; parent_id:string|null}[] };
async function call(path: string, method = 'GET', data?: unknown) {
  const response = await fetch('/api/' + path, { method, headers: {'Content-Type':'application/json','X-Keeps-Request':'1'}, body:data===undefined?undefined:JSON.stringify(data) });
  if(response.status===401) window.dispatchEvent(new Event('keeps-auth-expired'));
  if(!response.ok) { const err=await response.json();throw new Error(typeof err.detail==='string'?err.detail:'操作失败'); }
  return response.status===204?null:response.json();
}
export default function BackupPanel() {
  const { reload, toast, money }=useStore();
  const [busy,setBusy]=useState(''); const [error,setError]=useState('');
  const [report,setReport]=useState<Report|null>(null); const [mode,setMode]=useState<'merge'|'replace'>('merge');
  const [cloud,setCloud]=useState(false); const [password,setPassword]=useState('');
  const [url,setUrl]=useState('https://'); const [username,setUsername]=useState(''); const [secret,setSecret]=useState(''); const [hasPassword,setHasPassword]=useState(false);
  const [archives,setArchives]=useState<Attachment[]>([]);
  useEffect(()=>{call('attachments/archive/list').then(setArchives).catch(()=>{});},[]);
  const [result,setResult]=useState('');const file=useRef<HTMLInputElement>(null);
  useEffect(()=>{call('webdav').then(c=>{setUrl(c.url || 'https://');setUsername(c.username);setHasPassword(c.has_password);}).catch(e=>setError(e.message));},[]);
  let validUrl=false;
  try { const address=new URL(url); validUrl=!!address.hostname && ['https:','http:'].includes(address.protocol); } catch {}
  const run=async(label:string,action:()=>Promise<void>)=>{setBusy(label);setError('');setResult('');try{await action();}catch(e){setError((e as Error).message);}finally{setBusy('');}};
  const download=()=>run('正在整理原图、展示图与附件…',async()=>{
    if(!window.confirm('备份包含资产、附属关系、原图、展示图和备注附件，不包含回收站数据。继续导出？'))return;
    const response=await fetch('/api/backup/export');
    if(!response.ok){const e=await response.json();throw new Error(e.detail||'备份失败');}
    const blob=await response.blob();const link=document.createElement('a');const href=URL.createObjectURL(blob);
    link.href=href;link.download=`keeps-backup-${new Date().toISOString().slice(0,10)}.zip`;link.click();setTimeout(()=>URL.revokeObjectURL(href),60000);setResult('完整备份已生成，请确认浏览器下载完成。');
  });
  const preview=(selected:File)=>run('正在上传、解密并核对图片与记录…',async()=>{
    if(report)await call(`backup/preview/${report.token}`,'DELETE');setReport(null);
    const response=await fetch('/api/backup/preview',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Keeps-Request':'1','X-Backup-Password':encodeURIComponent(password)},body:selected});
    const value=await response.json();if(!response.ok)throw new Error(value.detail||'校验失败');setPassword('');setReport(value);setMode('merge');setCloud(false);
  });
  const saveConfig=async()=>{const c=await call('webdav','PUT',{url,username,password:secret||null});setUrl(c.url);setHasPassword(c.has_password);setSecret('');};
  return <div className="backup-panel">
    <section className="backup-section"><h3>完整备份</h3><p className="muted">一个 ZIP 包包含资产、附属物品、原图、展示图及备注附件。回收站与账号密码不包含在内。</p>
      <button className="btn primary" disabled={!!busy} onClick={download}>下载完整备份</button>
    </section>
    <section className="backup-section"><h3>导入与迁移</h3><p className="muted">选择有物 ZIP，或旧平台原始加密备份（.ias）。先解密并预览，确认前不会修改资产。</p>
      <label className="backup-label">解密密码<input type="password" autoComplete="off" value={password} onChange={e=>setPassword(e.target.value)} placeholder="备份密码" /></label>
      <input hidden ref={file} type="file" accept=".zip,.ias" onChange={e=>{const f=e.target.files?.[0];if(f)void preview(f);e.target.value='';}} />
      <button className="btn ghost" disabled={!!busy} onClick={()=>file.current?.click()}>选择压缩包</button>
    </section>
    <section className="backup-section"><h3>WebDAV 手动备份</h3>
      <div className="backup-config"><label>文件夹地址<input type="url" value={url} onChange={e=>setUrl(e.target.value)} /></label>
      <label>账号<input autoComplete="off" value={username} onChange={e=>setUsername(e.target.value)} /></label>
      <label>密码<input type="password" autoComplete="new-password" value={secret} onChange={e=>setSecret(e.target.value)} placeholder={hasPassword?'留空沿用当前密码':''} /></label></div>
      <div className="backup-actions"><button className="btn ghost" disabled={!!busy||!validUrl} onClick={()=>run('正在检查连接…',async()=>{await saveConfig();await call('webdav/test','POST',{});setResult('WebDAV 连接成功');})}>保存并测试连接</button>
      <button className="btn ghost" disabled={!!busy||!validUrl} onClick={()=>run('正在上传并回读校验…',async()=>{
        if(!window.confirm('本地覆盖云端：将替换云端 keeps-backup.zip。备份不包含回收站数据，确定继续？'))return;
        await saveConfig();const r=await call('webdav/upload','POST',{});setResult(`云端备份已替换：${r.assets} 条记录、${r.images} 张资产图、${r.attachments} 个附件。`);
      })}>本地覆盖云端</button>
      <button className="btn ghost" disabled={!!busy||!validUrl} onClick={()=>run('正在下载并核对云端备份…',async()=>{
        if(!window.confirm('云端覆盖本地：先下载并预览，确认后替换本地正常资产。回收站保留，继续？'))return;
        await saveConfig();const r=await call('webdav/download','POST',{});setReport(r);setMode('replace');setCloud(true);
      })}>云端覆盖本地</button></div>
    </section>
    {archives.length>0&&<section className="backup-section"><h3>迁移档案</h3><p className="muted">旧包里未关联资产的文件，完整保留并随备份导出。</p><div className="attachment-list">{archives.map(f=><div key={f.id}><a href={f.url} download>{f.name}</a><span>{Math.ceil(f.size/1024)} KB</span></div>)}</div></section>}
    {busy&&<p role="status" className="backup-progress">{busy}</p>}{error&&<p role="alert" className="account-error">{error}</p>}{result&&<p role="status">{result}</p>}
    {report&&<section className="backup-review"><h3>导入预览 · {report.source}</h3>
      <div className="backup-summary"><span><b>{report.assets}</b> 条记录</span><span><b>{report.images}</b> 张资产图</span><span><b>{report.attachments}</b> 个附件</span><span><b>{report.accessories}</b> 件附属物品</span></div>
      <p className="muted">已卖出 {report.sold} · 已退役 {report.retired} · 心愿 {report.wishes}</p>
      {report.warnings.map(w=><p className="backup-warning" key={w}>{w}</p>)}
      <details><summary>核对全部记录</summary><div className="import-records">{report.items.map(a=><div key={a.id}><span>{a.name}{a.parent_id?' · 附属物品':''}</span><span>{money(a.price)} · {({sold:'已卖出',retired:'已退役',serving:'使用中'})[a.status]||a.status}</span></div>)}</div></details>
      <label className="backup-label">导入方式<select value={mode} disabled={cloud||!!busy} onChange={e=>setMode(e.target.value as 'merge'|'replace')}><option value="merge">合并：保留现有资产，重复 ID 跳过</option><option value="replace">替换正常资产：保留本地回收站</option></select></label>
      <div className="backup-actions"><button className="btn primary" disabled={!!busy} onClick={()=>run('正在保存资产与图片…',async()=>{
        if(!window.confirm(mode==='replace'?'将替换本地正常资产，保留回收站。建议先下载当前完整备份。确认导入？':'将加入新资产，已有 ID（包括回收站）会跳过。确认导入？'))return;
        const r=await call('backup/apply','POST',{token:report.token,mode});setReport(null);await reload();setArchives(await call('attachments/archive/list'));setResult(`导入完成：新增 ${r.imported} 条，跳过 ${r.skipped} 条重复记录。`);toast('导入完成');
      })}>确认导入</button><button className="btn ghost" disabled={!!busy} onClick={()=>run('正在取消…',async()=>{await call(`backup/preview/${report.token}`,'DELETE');setReport(null);})}>取消导入</button></div>
    </section>}
  </div>;
}
