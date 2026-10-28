import { useRef, useState } from 'react';
import type { Attachment } from '../types';
export default function AttachmentEditor({files,onChange,onUpload,onBusy}:{files:Attachment[];onChange:(files:Attachment[])=>void;onUpload:(id:string)=>void;onBusy:(busy:boolean)=>void}) {
 const input=useRef<HTMLInputElement>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 return <div className="attachment-editor"><div className="attachment-list">{files.map(f=><div key={f.id}><a href={f.url} download>{f.name} <small>{Math.ceil(f.size/1024)} KB</small></a><button type="button" className="link danger" onClick={()=>onChange(files.filter(x=>x.id!==f.id))}>移除</button></div>)}</div>
 <input ref={input} hidden type="file" onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;if(file.size>30*1024*1024){setError('单个附件最多 30 MB');return;}setBusy(true);onBusy(true);setError('');try{const r=await fetch('/api/attachments',{method:'POST',headers:{'X-Keeps-Request':'1','X-File-Name':encodeURIComponent(file.name),'Content-Type':'application/octet-stream'},body:file});const body=await r.json();if(!r.ok)throw new Error(body.detail||'上传失败');onUpload(body.id);onChange([...files,body]);}catch(e){setError((e as Error).message);}finally{setBusy(false);onBusy(false);}}} />
 <button type="button" className="btn ghost small" disabled={busy} onClick={()=>input.current?.click()}>{busy?'正在上传…':'附件'}</button>{error&&<p role="alert" className="account-error">{error}</p>}</div>;
}
