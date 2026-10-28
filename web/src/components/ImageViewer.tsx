import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useModal } from '../hooks/useModal';

export default function ImageViewer({src, name, onClose}: {src:string; name:string; onClose:()=>void}) {
  const ref = useModal(onClose);
  const [failed, setFailed] = useState(false);
  return createPortal(
    <div ref={ref} className="image-viewer" role="dialog" aria-modal="true" aria-label={`${name} · 图片预览`}>
      <header className="image-viewer-header"><span>{name}</span><button type="button" aria-label="关闭图片预览" onClick={onClose}><X size={22}/></button></header>
      <div className="image-viewer-stage" onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
        {failed ? <p role="status">图片加载失败，请关闭后重试。</p> : <img src={src} alt={name} onError={()=>setFailed(true)} draggable={false}/>}
      </div>
    </div>, document.body,
  );
}
