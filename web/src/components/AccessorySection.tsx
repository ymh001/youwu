import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useStore } from '../store';
import { useUI } from '../ui';
import type { Asset } from '../types';
export default function AccessorySection({asset}:{asset:Asset}) {
 const {assets,updateAsset,money,toast}=useStore();const {openAccessory}=useUI();const navigate=useNavigate();const location=useLocation();
 const [selected,setSelected]=useState('');const [busy,setBusy]=useState(false);
 const children=assets.filter(a=>a.parent_id===asset.id);const parent=assets.find(a=>a.id===asset.parent_id);
 const ancestors=new Set<string>([asset.id]);let cursor=asset.parent_id;while(cursor&&!ancestors.has(cursor)){ancestors.add(cursor);cursor=assets.find(a=>a.id===cursor)?.parent_id||null;}
 const candidates=assets.filter(a=>!ancestors.has(a.id)&&!a.parent_id);
 const change=async(id:string,patch:Parameters<typeof updateAsset>[1])=>{setBusy(true);try{await updateAsset(id,patch);return true;}catch{return false;}finally{setBusy(false);}};
 return <section className="card accessory-card">
 <div className="card-title"><span>附属物品 <span className="muted">{children.length}</span></span><button className="link" onClick={()=>openAccessory(asset.id)}>添加附属物品</button></div>
 {parent&&<p className="muted small">本物品属于 <button className="link" onClick={()=>navigate(`/asset/${parent.id}`,{state:{from:location.pathname}})}>{parent.name}</button></p>}
 <p className="muted small">含所选附属物品的净成本：{money(asset.combined_cost)} · {money(asset.combined_daily)}/{asset.cost_rule==='per_use'?'次':'天'}。全局统计每件只计一次。</p>
 {children.map(child=><div className="accessory-row" key={child.id}>
 <div><button className="link accessory-name" onClick={()=>navigate(`/asset/${child.id}`,{state:{from:location.pathname}})}>{child.name}</button><span className="muted">{money(child.price)}</span></div>
 <div className="accessory-options"><label><input type="checkbox" checked={child.show_on_home} disabled={busy} onChange={e=>change(child.id,{show_on_home:e.target.checked})}/>主页展示</label><label><input type="checkbox" checked={child.include_in_parent} disabled={busy} onChange={e=>change(child.id,{include_in_parent:e.target.checked})}/>计入主物品成本</label><button className="link" disabled={busy} onClick={()=>{if(window.confirm('解除附属关系，恢复为独立资产？'))void change(child.id,{parent_id:null,show_on_home:true});}}>解除关系</button></div>
 </div>)}
 <div className="accessory-link"><select aria-label="选择已有资产作为附属物品" value={selected} onChange={e=>setSelected(e.target.value)}><option value="">选择已有资产…</option>{candidates.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select><button className="btn ghost small" disabled={!selected||busy} onClick={async()=>{if(await change(selected,{parent_id:asset.id,show_on_home:false,include_in_parent:true})){setSelected('');toast('附属关系已保存');}}}>关联</button></div>
 </section>;
}
