import type { Asset } from '../types';
import { targetProgress } from '../utils/target';
export default function TargetProgress({asset}:{asset:Asset}) {
  const goal=targetProgress(asset);
  if(!goal)return null;
  return <div className={`asset-target${goal.achieved?' achieved':''}`}>
    <div className="asset-target-label"><span>{goal.title}</span><strong>{goal.achieved?'已达成':`${Math.floor(goal.percent)}%`}</strong></div>
    <div className="asset-target-track" role="progressbar" aria-label="目标进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(goal.percent)}><span style={{width:`${goal.percent}%`}}/></div>
    {!goal.achieved&&goal.detail&&<small>{goal.detail}</small>}
  </div>;
}
