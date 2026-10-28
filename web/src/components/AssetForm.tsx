import { useLocation, useNavigate } from "react-router-dom";
import { assetReturnPath } from "../utils/assetNavigation";
import AttachmentEditor from "./AttachmentEditor";
import type { Attachment } from "../types";
import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, ImagePlus, LayoutGrid } from "lucide-react";
import { useModal } from "../hooks/useModal";
import { localToday } from "../utils/date";
import { amountInput } from "../utils/amountInput";
import { formSnapshot } from "../utils/formSnapshot";
import CategoryPicker from "./CategoryPicker";
import { AssetVisual } from "./AssetCard";
import { api } from "../api";
import { useStore } from "../store";
import type {
  Asset,
  AssetInput,
  AssetStatus,
  AssetType,
  CostRule,
} from "../types";

const EMOJIS = [
  "📦",
  "💻",
  "📱",
  "🖥️",
  "⌨️",
  "🖱️",
  "🎧",
  "🎮",
  "📷",
  "📺",
  "🖨️",
  "🔌",
  "💡",
  "🪑",
  "🛋️",
  "🛏️",
  "🚲",
  "🛴",
  "🚗",
  "⌚",
  "🎸",
  "🎹",
  "📚",
  "👟",
  "🧥",
  "🍳",
  "☕",
  "🧹",
  "🔧",
  "🧰",
  "🏋️",
  "🎒",
  "💎",
  "🧴",
  "🌬️",
  "🎤",
  "📖",
  "🧸",
  "🪥",
  "🪒",
  "🖊️",
  "🎨",
  "🧪",
  "🪴",
  "🛠️",
  "📐",
];

const today = localToday;

interface FormState {
  name: string;
  price: string;
  type: AssetType;
  status: AssetStatus;
  purchase_date: string;
  category_id: string;
  tag_ids: string[];
  icon: string;
  image_url: string;
  notes: string;
  parent_id: string;
  show_on_home: boolean;
  include_in_parent: boolean;
  attachments: Attachment[];
  cost_rule: CostRule;
  used_count: string;
  custom_daily: string;
  target_daily: string;
  target_mode: Asset['target_mode'];
  target_date: string;
  target_quantity: string;
  target_unit: string;
  target_step: string;
  target_completed: string;
  is_pinned: boolean;
  exclude_total: boolean;
  exclude_daily: boolean;
  sold_price: string;
  sold_date: string;
  retired_date: string;
}

const blank: FormState = {
  name: "",
  price: "",
  type: "asset",
  status: "serving",
  purchase_date: today(),
  category_id: "",
  tag_ids: [],
  icon: "📦",
  image_url: "",
  notes: "",
  parent_id: "",
  show_on_home: true,
  include_in_parent: true,
  attachments: [],
  cost_rule: "per_day",
  used_count: "",
  custom_daily: "",
  target_daily: "",
  target_mode: "none", target_date: "", target_quantity: "", target_unit: "次", target_step: "1", target_completed: "0",
  is_pinned: false,
  exclude_total: false,
  exclude_daily: false,
  sold_price: "",
  sold_date: "",
  retired_date: "",
};

function fromAsset(a: Asset): FormState {
  return {
    name: a.name,
    price: amountInput(a.price),
    type: a.type,
    status: a.status,
    purchase_date: (a.type === "wish" ? a.wish_date : a.purchase_date) ?? "",
    category_id: a.category_id ?? "",
    tag_ids: a.tags.map((t) => t.id),
    icon: a.icon || "📦",
    image_url: a.image_url || "",
    notes: a.notes || "",
    parent_id: a.parent_id || "",
    show_on_home: a.show_on_home,
    include_in_parent: a.include_in_parent,
    attachments: a.attachments || [],
    cost_rule: a.cost_rule,
    used_count: a.used_count ? String(a.used_count) : "",
    custom_daily: amountInput(a.custom_daily),
    target_daily: amountInput(a.target_daily),
    target_mode: a.target_mode || (a.target_daily ? 'price':'none'), target_date:a.target_date||'', target_quantity:a.target_quantity?String(a.target_quantity):'', target_unit:a.target_unit||'次', target_step:String(a.target_step||1), target_completed:String(a.target_completed||0),
    is_pinned: a.is_pinned,
    exclude_total: a.exclude_total,
    exclude_daily: a.exclude_daily,
    sold_price: amountInput(a.sold_price),
    sold_date: a.sold_date ?? "",
    retired_date: a.retired_date ?? "",
  };
}

export default function AssetForm({
  assetId,
  sourceId,
  parentId,
  convertWish = false,
  defaultType = "asset",
  onClose,
}: {
  assetId?: string;
  sourceId?: string;
  parentId?: string;
  convertWish?: boolean;
  defaultType?: AssetType;
  onClose: () => void;
}) {
  const {
    categories,
    tags,
    assets,
    wishes,
    createAsset,
    createCategory,
    updateAsset,
    deleteAsset,
    toast,
    money,
  } = useStore();
  const existing = useMemo(
    () => [...assets, ...wishes].find((a) => a.id === (assetId || sourceId)),
    [assetId, sourceId, assets, wishes],
  );
  const [form, setForm] = useState<FormState>(() => ({ ...blank, purchase_date: today(), type: defaultType, parent_id: parentId || "", show_on_home: !parentId }));
  const initialSnapshot = useRef(formSnapshot(form));
  const [saving, setSaving] = useState(false);
  const [categoryEditorOpen, setCategoryEditorOpen] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);
  const initializedId = useRef<string>();
  const [imageUploading, setImageUploading] = useState(false);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const uploading = imageUploading || attachmentUploading;
  const navigate = useNavigate();
  const location = useLocation();
  const [choosingIcon, setChoosingIcon] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadedUrls = useRef<string[]>([]);
  const savedUrl = useRef("");
  const attachmentUploads = useRef<string[]>([]);
  const savedAttachments = useRef<string[]>([]);
  const close = () => {
    if (saving || uploading || savingCategory) {
      toast("请等待保存完成");
      return;
    }
    if ((formSnapshot(form) !== initialSnapshot.current || categoryName.trim()) &&
        !window.confirm("还有未保存的修改，确定放弃并关闭？")) return;
    onClose();
  };
  const modalRef = useModal(close);
  useEffect(
    () => () => {
      attachmentUploads.current.filter(id=>!savedAttachments.current.includes(id)).forEach(id=>{fetch(`/api/attachments/${id}`,{method:"DELETE",headers:{"X-Keeps-Request":"1"}}).catch(()=>{});});
      uploadedUrls.current
        .filter((url) => url !== savedUrl.current)
        .forEach((url) => {
          api.deleteUnusedImage(url).catch(() => {});
        });
    },
    [],
  );
  const upload = async (file?: File) => {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast("请选择 20 MB 以内的图片");
      return;
    }
    setImageUploading(true);
    try {
      const result = await api.uploadImage(file);
      uploadedUrls.current.push(result.image_url);
      setForm((prev) => ({ ...prev, image_url: result.image_url }));
      setChoosingIcon(false);
      toast("图片已添加");
    } catch (error) {
      toast((error as Error).message);
    } finally {
      setImageUploading(false);
    }
  };
  const initialForm = (a:Asset): FormState => convertWish ? {
    ...blank,type:'asset',name:a.name,price:amountInput(a.price),notes:a.notes||'',image_url:a.image_url||'',icon:a.icon,attachments:a.attachments||[],purchase_date:'',
  } : {...fromAsset(a),...(sourceId?{notes:'',attachments:[],parent_id:'',show_on_home:true}:{})};
  const [loaded, setLoaded] = useState(!assetId && !sourceId);

  useEffect(() => {
    if (!assetId && !sourceId) return;
    if (initializedId.current === (assetId || sourceId)) return;
    const initialize = (asset: Asset) => {
      const nextForm = initialForm(asset);
      initialSnapshot.current = formSnapshot(nextForm);
      initializedId.current = assetId || sourceId;
      setForm(nextForm);
      setLoaded(true);
    };
    if (existing) {
      initialize(existing);
      return;
    }
    let cancelled = false;
    api
      .getAsset((assetId || sourceId)!)
      .then((a) => {
        if (!cancelled) initialize(a);
      })
      .catch((err) => { if (!cancelled) toast(err.message); })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [assetId, sourceId, existing, toast, convertWish]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const addCategory = async () => {
    const name = categoryName.trim();
    if (!name || savingCategory) return;
    const matched = categories.find(
      (c) => c.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase(),
    );
    if (matched) {
      set("category_id", matched.id);
      setCategoryEditorOpen(false);
      setCategoryName("");
      toast("已选择已有分类");
      return;
    }
    setSavingCategory(true);
    try {
      const category = await createCategory({
        name,
        icon: "",
        color: "#007aff",
        sort: Math.max(-1, ...categories.map((c) => c.sort)) + 1,
      });
      set("category_id", category.id);
      setCategoryEditorOpen(false);
      setCategoryName("");
      toast("分类已创建并选中");
    } catch {
      /* Store displays the error; keep the entered name for retry. */
    } finally {
      setSavingCategory(false);
    }
  };

  const toggleTag = (id: string) => {
    setForm((prev) => ({
      ...prev,
      tag_ids: prev.tag_ids.includes(id)
        ? prev.tag_ids.filter((t) => t !== id)
        : [...prev.tag_ids, id],
    }));
  };

  const submit = async () => {
    if (!form.name.trim()) {
      toast("请输入资产名称");
      return;
    }
    if (!Number.isFinite(Number(form.price)) || Number(form.price) < 0) {
      toast("请输入有效的购买价格");
      return;
    }
    if (
      !assetId &&
      [...assets, ...wishes].some((a) => a.name.trim() === form.name.trim()) &&
      !window.confirm("资产已存在，是否继续添加")
    )
      return;
    if (
      form.type === "asset" &&
      (form.status === "sold" || form.status === "retired")
    ) {
      const date = form.status === "sold" ? form.sold_date : form.retired_date;
      if (
        !date ||
        date > today() ||
        (form.purchase_date && date < form.purchase_date)
      ) {
        toast("请填写购买日期至今天之间的有效日期");
        return;
      }
      if (
        form.status === "sold" &&
        (!form.sold_price.trim() ||
          !Number.isFinite(Number(form.sold_price)) ||
          Number(form.sold_price) < 0)
      ) {
        toast("请填写有效的卖出价格");
        return;
      }
    }
    if(form.type==='asset'&&form.target_mode==='price'&&!(Number(form.target_daily)>0)){toast('目标金额必须大于 0');return;}
    if(form.type==='asset'&&form.target_mode==='date'&&(!form.purchase_date||!form.target_date||form.target_date<form.purchase_date)){toast('目标日期不能早于购买日期，请补全日期');return;}
    if(form.type==='asset'&&form.target_mode==='custom'&&(!(Number(form.target_quantity)>0)||!form.target_unit.trim()||!(Number(form.target_step)>0)||!(Number(form.target_completed)>=0))){toast('请填写有效的目标数量、单位和增加数量');return;}
    if(convertWish&&(!form.purchase_date||form.purchase_date>today())){toast('请填写实际购买日期，不能晚于今天');return;}
    const payload: AssetInput = {
      name: form.name.trim(),
      price: Number(form.price) || 0,
      type: form.type,
      status: form.type === "wish" ? "serving" : form.status,
      purchase_date: form.type === "wish" ? null : form.purchase_date || null,
      wish_date: form.type === "wish" ? form.purchase_date || today() : null,
      category_id: form.category_id || null,
      tag_ids: form.tag_ids,
      icon: form.icon,
      image_url: form.image_url,
      notes: form.notes,
      parent_id: form.parent_id || null,
      show_on_home: form.show_on_home,
      include_in_parent: form.include_in_parent,
      attachment_ids: form.attachments.map(f=>f.id),
      cost_rule: form.cost_rule,
      used_count: Number(form.used_count) || 0,
      custom_daily: form.custom_daily ? Number(form.custom_daily) : null,
      target_daily: form.target_mode==='price' ? Number(form.target_daily) : null,
      target_mode:form.target_mode, target_date:form.target_mode==='date'?form.target_date:null,
      target_quantity:form.target_mode==='custom'?Number(form.target_quantity):null,
      target_unit:form.target_unit.trim()||'次', target_step:Number(form.target_step)||1, target_completed:Number(form.target_completed)||0,
      is_pinned: form.is_pinned,
      exclude_total: form.exclude_total,
      exclude_daily: form.exclude_daily,
    };
    const wishPayload: AssetInput = {name:payload.name,price:payload.price,type:'wish',image_url:payload.image_url,icon:payload.icon,notes:payload.notes,attachment_ids:payload.attachment_ids};
    if (form.type === "asset" && form.status === "sold") {
      payload.sold_price = form.sold_price ? Number(form.sold_price) : null;
      payload.sold_date = form.sold_date || today();
    }
    if (form.type === "asset" && form.status === "retired")
      payload.retired_date = form.retired_date || today();
    setSaving(true);
    try {
      if (assetId) {
        await updateAsset(assetId, form.type==='wish'?wishPayload:payload);
        toast("已保存");
      } else {
        await createAsset(form.type==='wish'?{...wishPayload,wish_date:today()}:payload);
        toast("已添加");
      }
      savedUrl.current = form.image_url;
      savedAttachments.current = form.attachments.map(f=>f.id);
      onClose();
      if(convertWish)navigate('/',{replace:true});
    } catch {
      /* toast handled in store */
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!assetId) return;
    if (!window.confirm("确定将此资产移入回收站？可在设置的回收站中还原。"))
      return;
    try {
      const target = assetReturnPath({id:assetId,type:existing?.type||form.type}, location.state?.from,[...assets,...wishes].map(a=>a.id));
      await deleteAsset(assetId);
      toast("已移入回收站");
      onClose();
      if(location.pathname===`/asset/${assetId}`)navigate(target,{replace:true});
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      ref={modalRef}
      className={`form-sheet asset-form${form.type==='wish'?' wish-form':''}`}
      role="dialog"
      aria-modal="true"
      aria-label={convertWish?"心愿转为资产":`${assetId?"编辑":"新增"}${form.type==='wish'?'心愿':'资产'}`}
    >
      <header className="form-header">
        <button className="link" onClick={close}>
          取消
        </button>
        <strong>
          {convertWish ? "心愿转为资产" : assetId
            ? (form.type === "wish" ? "编辑心愿" : "编辑资产")
            : form.type === "wish"
              ? "新增心愿"
              : "新增资产"}
        </strong>
        <button
          className="link primary"
          disabled={saving || uploading || savingCategory || !loaded}
          onClick={submit}
        >
          {saving ? "保存中…" : convertWish ? "确认转为资产" : "保存"}
        </button>
      </header>

      <div className="form-body">
        <aside className="asset-editor-visual">
        <div className="image-upload unified-cover">
          <div className="upload-preview" aria-label="当前资产封面">
            <AssetVisual asset={{image_url:form.image_url,name:form.name||"资产封面",icon:form.icon}}/>
          </div>
          <div className="cover-controls">
            {uploading && <p className="cover-upload-status" role="status">正在上传…</p>}
            <div className="upload-buttons">
              <button type="button" className="btn ghost" disabled={uploading} aria-expanded={choosingIcon} aria-controls="cover-icon-options" onClick={()=>setChoosingIcon(v=>!v)}><LayoutGrid size={16}/>图标</button>
              <button type="button" className="btn ghost" disabled={uploading} onClick={()=>uploadRef.current?.click()}><ImagePlus size={16}/>上传</button>
              <button type="button" className="btn ghost" disabled={uploading} onClick={()=>cameraRef.current?.click()}><Camera size={16}/>拍照</button>
            </div>
          </div>
          {choosingIcon && <div id="cover-icon-options" className="emoji-grid cover-icon-options" role="group" aria-label="选择封面图标">
            {EMOJIS.map(icon=><button key={icon} type="button" className={`emoji-item${!form.image_url&&form.icon===icon?' active':''}`} aria-label={`使用 ${icon} 作为封面`} aria-pressed={!form.image_url&&form.icon===icon} disabled={uploading} onClick={()=>{setForm(prev=>({...prev,icon,image_url:''}));setChoosingIcon(false);}}>{icon}</button>)}
          </div>}
          <input
            ref={uploadRef}
            hidden
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
            onChange={(e) => {
              upload(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <input
            ref={cameraRef}
            hidden
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              upload(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
        <section className="card form-card notes-form-card">
          <label className="field column">
            <span>备注</span>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="留几句话，给这件物品……"
            />
          </label>
          <AttachmentEditor files={form.attachments} onChange={files=>set("attachments",files)} onUpload={id=>attachmentUploads.current.push(id)} onBusy={setAttachmentUploading} />
        </section>
        </aside>
        <div className="asset-editor-fields">
        <section className="card form-card">
          <label className="field">
            <span>名称</span>
            <input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </label>
          <label className="field">
            <span>价格</span>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              onBlur={() => set("price", amountInput(form.price))}
              value={form.price}
              onChange={(e) => set("price", e.target.value)}
              placeholder="0.00"
            />
          </label>
          {!convertWish && (!assetId || existing?.type!=='wish') && <div className="field asset-type-field">
            <span>类型</span>
            <div className="segmented" role="group" aria-label="类型">
              {(["asset", "wish"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={form.type === t ? "active" : ""}
                  aria-pressed={form.type === t}
                  onClick={() => set("type", t)}
                >
                  {t === "asset" ? "资产" : "心愿"}
                </button>
              ))}
            </div>
          </div>}

        </section>

        {form.type==='asset' && <>
        <section className="card form-card">
          <label className="field">
            <span>购买日期</span>
            <input
              type="date"
              aria-label="购买日期"
              value={form.purchase_date}
              onChange={(e) => set("purchase_date", e.target.value)}
            />
          </label>
          <div className="field column">
            <div className="category-field-heading">
              <span>分类</span>
              <button
                type="button"
                className="link"
                aria-expanded={categoryEditorOpen}
                onClick={() => setCategoryEditorOpen((v) => !v)}
                disabled={savingCategory}
              >
                ＋ 新建分类
              </button>
            </div>
            {categoryEditorOpen && (
              <div className="inline-category-editor">
                <input
                  autoFocus
                  aria-label="新分类名称"
                  placeholder="分类名称"
                  maxLength={80}
                  value={categoryName}
                  disabled={savingCategory}
                  onChange={(e) => setCategoryName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      void addCategory();
                    }
                  }}
                />
                <div className="inline-category-actions">
                  <button
                    type="button"
                    className="btn ghost small"
                    disabled={savingCategory}
                    onClick={() => {
                      setCategoryEditorOpen(false);
                      setCategoryName("");
                    }}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="btn primary small"
                    disabled={!categoryName.trim() || savingCategory}
                    onClick={addCategory}
                  >
                    {savingCategory ? "创建中…" : "创建并选中"}
                  </button>
                </div>
              </div>
            )}
            <CategoryPicker
              selectedId={form.category_id}
              onSelect={(id) => set("category_id", id)}
            />
          </div>
          <div className="field column">
            <span>标签</span>
            <div className="chips wrap">
              {tags.length === 0 && (
                <span className="muted">暂无标签，可在设置中添加</span>
              )}
              {tags.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`chip tag${form.tag_ids.includes(t.id) ? " active" : ""}`}
                  onClick={() => toggleTag(t.id)}
                  style={{
                    borderColor: form.tag_ids.includes(t.id)
                      ? t.color
                      : undefined,
                  }}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="card form-card">
          <div className="field column">
            <span>成本计算规则</span>
            <div className="segmented">
              {(
                [
                  ["per_day", "按天"],
                  ["per_use", "按次"],
                  ["custom", "自定义"],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  className={form.cost_rule === v ? "active" : ""}
                  onClick={() => set("cost_rule", v)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {form.cost_rule === "per_use" && (
            <label className="field">
              <span>使用次数</span>
              <input
                type="number"
                inputMode="numeric"
                value={form.used_count}
                onChange={(e) => set("used_count", e.target.value)}
                placeholder="0"
              />
            </label>
          )}
          {form.cost_rule === "custom" && (
            <label className="field">
              <span>每日成本</span>
              <input
                type="number"
                inputMode="decimal"
                step="any"
                onBlur={() => set("custom_daily", amountInput(form.custom_daily))}
                value={form.custom_daily}
                onChange={(e) => set("custom_daily", e.target.value)}
                placeholder="0.00"
              />
            </label>
          )}
          <div className="field block target-settings">
            <span>目标日均</span>
            <div className="segmented">{([['none','不设定'],['price','按价格'],['date','按日期'],['custom','自定义']] as const).map(([value,label])=><button type="button" key={value} className={form.target_mode===value?'active':''} onClick={()=>set('target_mode',value)}>{label}</button>)}</div>
          </div>
          {form.target_mode==='price'&&<label className="field"><span>{form.cost_rule==='per_use'?'目标次均金额':'目标日均金额'}</span><input aria-label="目标金额" type="number" min="0.01" step="any" inputMode="decimal" placeholder="0.00" onBlur={()=>set("target_daily",amountInput(form.target_daily))} value={form.target_daily} onChange={e=>set('target_daily',e.target.value)}/></label>}
          {form.target_mode==='date'&&<label className="field"><span>目标日期</span><input aria-label="目标日期" type="date" min={form.purchase_date||undefined} value={form.target_date} onChange={e=>set('target_date',e.target.value)}/></label>}
          {form.target_mode==='custom'&&<>
            <label className="field"><span>目标数量</span><input aria-label="目标数量" type="number" min="0" step="any" inputMode="decimal" placeholder="0" value={form.target_quantity} onChange={e=>set('target_quantity',e.target.value)}/></label>
            <label className="field"><span>单位</span><input aria-label="目标单位" maxLength={16} value={form.target_unit} onChange={e=>set('target_unit',e.target.value)} placeholder="次"/></label>
            <label className="field"><span>增加数量</span><input aria-label="每次增加数量" type="number" min="0" step="any" inputMode="decimal" placeholder="0" value={form.target_step} onChange={e=>set('target_step',e.target.value)}/></label>
            <label className="field"><span>已完成数量</span><input aria-label="已完成数量" type="number" min="0" step="any" inputMode="decimal" placeholder="0" value={form.target_completed} onChange={e=>set('target_completed',e.target.value)}/></label>
            <p className="hint">在资产详情点击增加数量，手动累计进度；不会自动按天增加。</p>
          </>}

        </section>

        {form.type === "asset" && <section className="card form-card relation-card">
          <label className="field"><span>所属主物品</span><select value={form.parent_id} onChange={e=>setForm(prev=>({...prev,parent_id:e.target.value,show_on_home:!e.target.value}))}><option value="">独立资产</option>{assets.filter(a=>a.id!==assetId).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          {form.parent_id && <><SwitchRow label="附属物品在主页展示" value={form.show_on_home} onChange={v=>set("show_on_home",v)} /><SwitchRow label="计入主物品成本" value={form.include_in_parent} onChange={v=>set("include_in_parent",v)} /><p className="hint">主物品按自身持有天数摊分合并成本；全局统计每件资产只计一次。</p></>}
        </section>}
        <section className="card form-card">
          <SwitchRow
            label="置顶"
            value={form.is_pinned}
            onChange={(v) => set("is_pinned", v)}
          />
          <SwitchRow
            label="不计入总资产"
            value={form.exclude_total}
            onChange={(v) => set("exclude_total", v)}
          />
          <SwitchRow
            label="不计入日均"
            value={form.exclude_daily}
            onChange={(v) => set("exclude_daily", v)}
          />
        </section>

        {assetId && !convertWish && form.type === "asset" && (
          <section className="card form-card">
            <div className="field column">
              <span>状态</span>
              <div className="segmented">
                {(
                  [
                    ["serving", "服役中"],
                    ["retired", "已退役"],
                    ["sold", "已卖出"],
                  ] as const
                ).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    className={form.status === v ? "active" : ""}
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        status: v,
                        ...(v === "retired" && !prev.retired_date
                          ? { retired_date: today() }
                          : {}),
                        ...(v === "sold" && !prev.sold_date
                          ? { sold_date: today() }
                          : {}),
                      }))
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {form.status === "retired" && (
              <label className="field">
                <span>退役日期</span>
                <input
                  type="date"
                  value={form.retired_date}
                  min={form.purchase_date || undefined}
                  max={today()}
                  onChange={(e) => set("retired_date", e.target.value)}
                />
              </label>
            )}
            {form.status === "sold" && (
              <>
                <label className="field">
                  <span>卖出价格</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    onBlur={() => set("sold_price", amountInput(form.sold_price))}
                    value={form.sold_price}
                    onChange={(e) => set("sold_price", e.target.value)}
                    placeholder="0.00"
                  />
                </label>
                <label className="field">
                  <span>卖出日期</span>
                  <input
                    type="date"
                    value={form.sold_date}
                    onChange={(e) => set("sold_date", e.target.value)}
                  />
                </label>
              </>
            )}
          </section>
        )}



        </>}
        </div>
        {assetId && !convertWish && (
          <button className="btn danger block asset-editor-delete" onClick={remove}>
            {form.type==='wish'?'删除心愿':'删除资产'}
          </button>
        )}
      </div>
    </div>
  );
}

function SwitchRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="field">
      <span>{label}</span>
      <button
        type="button"
        className={`switch${value ? " on" : ""}`}
        onClick={() => onChange(!value)}
        aria-pressed={value}
      >
        <i />
      </button>
    </div>
  );
}
