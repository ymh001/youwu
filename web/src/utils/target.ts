import type { Asset } from '../types';
const DAY=86400000;
export function targetProgress(asset:Asset) {
  const mode=asset.target_mode || (asset.target_daily && asset.target_daily>0?'price':'none');
  if(asset.type==='wish'||mode==='none')return null;
  let ratio=0,title='',detail='';
  const cost=asset.combined_cost??asset.total_cost;
  const start=asset.purchase_date?Date.parse(asset.purchase_date.slice(0,10)+'T00:00:00Z'):NaN;
  const stopped=asset.status!=='serving';
  if(mode==='custom') {
    if(!asset.target_quantity)return null;
    const done=asset.target_completed||0;
    ratio=done/asset.target_quantity;
    title=`${done.toLocaleString('zh-CN')} / ${asset.target_quantity.toLocaleString('zh-CN')} ${asset.target_unit||'次'}`;
    detail=stopped?'已停止累计':'手动累计';
  } else if(mode==='date') {
    const end=Date.parse((asset.target_date||'')+'T00:00:00Z');
    if(!Number.isFinite(start)||!Number.isFinite(end)||end<start)return null;
    const days=Math.round((end-start)/DAY)+1;
    ratio=asset.days/days;
    title=`目标 ${days} 天`;
    detail=stopped?'已停止累计':`目标日期 ${asset.target_date}`;
  } else {
    if(!asset.target_daily||asset.target_daily<=0)return null;
    const daily=asset.combined_daily??asset.daily_cost;
    ratio=daily<=asset.target_daily?1:asset.target_daily/daily;
    title=`目标 ¥${asset.target_daily.toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})}/${asset.cost_rule==='per_use'?'次':'天'}`;
    if(stopped)detail='已停止累计';
    else if(asset.cost_rule==='per_day'&&Number.isFinite(start)) {
      const needed=Math.max(1,Math.ceil(Math.max(0,cost)/asset.target_daily));
      const date=new Date(start+(needed-1)*DAY);
      if(Number.isFinite(date.getTime())&&date.getUTCFullYear()<=9999)detail=`预计 ${date.toISOString().slice(0,10)}`;
    }
  }
  const achieved=ratio>=1;
  return {percent:Math.min(100,Math.max(0,ratio*100)),title,detail:achieved?'已达成':detail,achieved};
}
