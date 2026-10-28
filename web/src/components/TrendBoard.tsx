import { Children, useEffect, useRef, useState, type ReactElement, type ReactNode, type PointerEvent, type CSSProperties } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { GripVertical, Plus, X } from 'lucide-react';
import './TrendBoard.css';
import { appendWidget, layoutRows, moveInReadingOrder, moveToColumn, restoreLayout, type WidgetPlacement, type WidgetSize } from '../utils/trendLayout';

type WidgetProps = { id:string; title:string; size?:WidgetSize; children:ReactNode };
export function TrendWidget({children}:WidgetProps) { return <>{children}</>; }
const KEY='youwu.trend-layout.v2';
const LEGACY_KEY='youwu.trend-layout.v1';
type Drag = {id:string;pointer:number;startX:number;startY:number;x:number;y:number;dx:number;dy:number;node:HTMLElement;before:WidgetPlacement[];active:boolean;ghost:HTMLElement|null};

export default function TrendBoard({children}:{children:ReactElement<WidgetProps>[]}) {
  const widgets=Children.toArray(children) as ReactElement<WidgetProps>[];
  const definitions=widgets.map(w=>({id:w.props.id,size:w.props.size}));
  const [order,setOrder]=useState<WidgetPlacement[]>(()=>{
    const read=(key:string)=>{try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}};
    return restoreLayout(read(KEY),read(LEGACY_KEY),definitions);
  });
  const orderRef=useRef(order);
  const [editing,setEditing]=useState(false);
  const [adding,setAdding]=useState(false);
  const [dragId,setDragId]=useState<string|null>(null);
  const [storageError,setStorageError]=useState(false);
  const root=useRef<HTMLDivElement>(null);
  const drag=useRef<Drag|null>(null);
  const timer=useRef<ReturnType<typeof setTimeout>>();
  const frame=useRef(0);
  const suppress=useRef(0);
  const reduced=useReducedMotion();
  const moveHandler=useRef<(e:globalThis.PointerEvent)=>void>(()=>{});
  const endHandler=useRef<(cancel:boolean)=>void>(()=>{});
  const change=(ids:WidgetPlacement[])=>{orderRef.current=ids;setOrder(ids);};
  const save=(ids:WidgetPlacement[])=>{
    try {localStorage.setItem(KEY,JSON.stringify(ids));setStorageError(false);}
    catch {setStorageError(true);}
  };
  const finish=(cancel=false)=>{
    clearTimeout(timer.current);cancelAnimationFrame(frame.current);
    const g=drag.current;drag.current=null;
    g?.ghost?.remove();setDragId(null);

    if(!g?.active)return;
    suppress.current=Date.now()+350;
    if(cancel)change(g.before);else save(orderRef.current);
  };
  useEffect(()=>{
    const cancel=()=>endHandler.current(true);
    const pointerMove=(e:globalThis.PointerEvent)=>moveHandler.current(e);
    const pointerUp=(e:globalThis.PointerEvent)=>{if(e.pointerId===drag.current?.pointer)endHandler.current(false);};
    const pointerCancel=(e:globalThis.PointerEvent)=>{if(e.pointerId===drag.current?.pointer)endHandler.current(true);};
    const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){finish(true);setEditing(false);setAdding(false);}};
    const touch=(e:TouchEvent)=>{if(drag.current?.active&&e.cancelable)e.preventDefault();};
    document.addEventListener('pointermove',pointerMove,{passive:false});
    document.addEventListener('pointerup',pointerUp);
    document.addEventListener('pointercancel',pointerCancel);
    window.addEventListener('blur',cancel);
    window.addEventListener('keydown',key);
    document.addEventListener('touchmove',touch,{passive:false});
    return ()=>{
      clearTimeout(timer.current);cancelAnimationFrame(frame.current);drag.current?.ghost?.remove();
      document.removeEventListener('pointermove',pointerMove);document.removeEventListener('pointerup',pointerUp);document.removeEventListener('pointercancel',pointerCancel);
      window.removeEventListener('blur',cancel);window.removeEventListener('keydown',key);
      document.removeEventListener('touchmove',touch);
    };
  },[]);
  const locate=(g:Drag)=>{
    const board=root.current;if(!board)return;
    const r=board.getBoundingClientRect();
    if(g.x<r.left-24||g.x>r.right+24)return;
    // Read final layout offsets rather than neighbouring widgets' animated transforms.
    const slots=[...board.querySelectorAll<HTMLElement>(':scope > [data-widget-id]')].map(el=>({
      id:el.dataset.widgetId!,left:r.left+el.offsetLeft,top:r.top+el.offsetTop,width:el.offsetWidth,height:el.offsetHeight,
    }));
    const own=slots.find(s=>s.id===g.id);
    if(own&&g.x>=own.left&&g.x<=own.left+own.width&&g.y>=own.top&&g.y<=own.top+own.height)return;
    const mobile=window.matchMedia('(max-width:800px)').matches;
    const column:0|1=g.x<r.left+r.width/2?0:1;
    const lane=orderRef.current.filter(p=>p.id!==g.id&&(mobile||p.column===column));
    let index=lane.findIndex(p=>{const s=slots.find(s=>s.id===p.id);return s&&g.y<s.top+s.height/2;});
    if(index<0)index=lane.length;
    const next=mobile?moveInReadingOrder(orderRef.current,g.id,index):moveToColumn(orderRef.current,g.id,column,index);
    if(next.some((p,i)=>p.id!==orderRef.current[i]?.id||p.column!==orderRef.current[i]?.column))change(next);
  };
  const scroll=()=>{
    const g=drag.current;if(!g?.active)return;
    const edge=80;
    const delta=g.y<edge?-Math.min(14,(edge-g.y)/4):g.y>innerHeight-edge?Math.min(14,(g.y-innerHeight+edge)/4):0;
    if(delta){window.scrollBy(0,delta);locate(g);}
    frame.current=requestAnimationFrame(scroll);
  };
  const lift=(g:Drag)=>{
    if(drag.current!==g)return;
    g.active=true;setEditing(true);setAdding(false);setDragId(g.id);
    const r=g.node.getBoundingClientRect();
    const clone=g.node.cloneNode(true) as HTMLElement;
    clone.className=`trend-widget widget-${widgets.find(w=>w.props.id===g.id)?.props.size||'short'} trend-widget-ghost`;
    clone.setAttribute('aria-hidden','true');
    clone.removeAttribute('data-widget-id');
    clone.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));
    clone.querySelectorAll('button,input,select,a,[tabindex]').forEach(n=>n.setAttribute('tabindex','-1'));
    Object.assign(clone.style,{position:'fixed',left:'0',top:'0',width:r.width+'px',height:r.height+'px',transform:`translate3d(${g.x-g.dx}px,${g.y-g.dy}px,0)`});
    document.body.appendChild(clone);g.ghost=clone;
    frame.current=requestAnimationFrame(scroll);
  };
  const start=(e:PointerEvent<HTMLDivElement>,id:string)=>{
    if(!e.isPrimary||e.button!==0||drag.current)return;
    const target=e.target as Element;
    if(target.closest('[data-widget-action]')||(!editing&&target.closest('button,a,input,select,[role="button"],[role="slider"]')))return;
    const r=e.currentTarget.getBoundingClientRect();
    const g:Drag={id,pointer:e.pointerId,startX:e.clientX,startY:e.clientY,x:e.clientX,y:e.clientY,dx:e.clientX-r.left,dy:e.clientY-r.top,node:e.currentTarget,before:[...orderRef.current],active:false,ghost:null};
    drag.current=g;
    if(editing&&e.pointerType==='mouse')lift(g);else timer.current=setTimeout(()=>lift(g),450);
  };
  const move=(e:globalThis.PointerEvent)=>{
    const g=drag.current;if(!g||g.pointer!==e.pointerId)return;
    if(e.pointerType==='mouse'&&e.buttons===0){finish(true);return;}
    g.x=e.clientX;g.y=e.clientY;
    if(!g.active){if(Math.hypot(g.x-g.startX,g.y-g.startY)>8){clearTimeout(timer.current);drag.current=null;}return;}
    e.preventDefault();
    if(g.ghost)g.ghost.style.transform=`translate3d(${g.x-g.dx}px,${g.y-g.dy}px,0)`;
    if(Math.hypot(g.x-g.startX,g.y-g.startY)>8)locate(g);
  };
  moveHandler.current=move;endHandler.current=finish;
  const hidden=widgets.filter(w=>!order.some(p=>p.id===w.props.id));
  const positions=layoutRows(order,definitions);
  return <div className="trend-board">
    <div className="trend-board-toolbar"><span className="muted small">{editing?'长按拖动，调整布局':''}</span><button type="button" className="link" onClick={()=>{finish();setEditing(v=>!v);setAdding(false);}}>{editing?'完成':'编辑视图'}</button></div>
    <div className={`trend-widget-grid${editing?' is-editing':''}`} ref={root} aria-label="趋势视图"
      onClickCapture={e=>{if(Date.now()<suppress.current){e.preventDefault();e.stopPropagation();}}}>
      {positions.map(({id,column,row,span})=>{
        const widget=widgets.find(w=>w.props.id===id);if(!widget)return null;
        return <motion.div key={id} layout="position" transition={{duration:reduced?0:.18}}
          className={`trend-widget widget-${widget.props.size||'short'}${dragId===id?' widget-placeholder':''}`}
          style={{'--widget-column':column+1,'--widget-row':row,'--widget-span':span} as CSSProperties}
          data-widget-id={id} onPointerDown={e=>start(e,id)}
          onPointerLeave={()=>{if(drag.current&&!drag.current.active){clearTimeout(timer.current);drag.current=null;}}}
          onContextMenu={e=>{if(!(e.target as Element).closest('input,select,a'))e.preventDefault();}}>
          {editing&&<><button className="widget-remove" type="button" data-widget-action aria-label={`关闭${widget.props.title}视图`} onClick={()=>{const ids=orderRef.current.filter(x=>x.id!==id);change(ids);save(ids);}}><X size={14}/></button>
          <button type="button" className="widget-grip" aria-label={`拖动${widget.props.title}排序`} title="拖动排序；Alt + 上下移动，左右换列" onKeyDown={e=>{
            if(!e.altKey||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();
            const current=orderRef.current,item=current.find(p=>p.id===id);if(!item)return;
            const mobile=window.matchMedia('(max-width:800px)').matches;
            let next=current;
            if(e.key==='ArrowLeft'||e.key==='ArrowRight'){
              if(mobile)return;
              const column=e.key==='ArrowLeft'?0:1;
              if(column===item.column)return;
              const index=current.filter(p=>p.column===item.column).findIndex(p=>p.id===id);
              next=moveToColumn(current,id,column,index);
            }else{
              const lane=mobile?current:current.filter(p=>p.column===item.column);
              const index=lane.findIndex(p=>p.id===id)+(e.key==='ArrowUp'?-1:1);
              next=mobile?moveInReadingOrder(current,id,index):moveToColumn(current,id,item.column,index);
            }
            change(next);save(next);
          }}><GripVertical size={16}/></button></>}
          <div className="widget-content" ref={node => { if (node) node.inert = editing; }}>{widget.props.children}</div>
        </motion.div>;
      })}
    </div>
    {!order.length&&<div className="trend-empty">添加一个视图，开始查看趋势</div>}
    <button type="button" className="btn ghost widget-add" aria-label="添加趋势视图" aria-expanded={adding} onClick={()=>setAdding(v=>!v)}><Plus size={20}/><span>添加视图</span></button>
    {adding&&<div className="widget-catalog" aria-label="可添加的视图">
      {hidden.length?hidden.map(w=><button type="button" className="btn ghost" key={w.props.id} onClick={()=>{const ids=appendWidget(orderRef.current,w.props.id,definitions);change(ids);save(ids);setAdding(false);}}><Plus size={16}/>{w.props.title}</button>):<span className="muted small">所有视图都已添加</span>}
    </div>}
    {storageError&&<p role="status" className="small muted">浏览器未能保存布局，本次调整仍然有效。</p>}
  </div>;
}
