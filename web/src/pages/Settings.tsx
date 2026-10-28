import { useState, type ReactNode } from "react";
import {
  Layers3,
  Folder,
  Tags,
  Archive,
  Trash2,
  Banknote,
  CircleDot,
  Hash,
  Contrast,
  Info,
  Database,
} from "lucide-react";
import { useModal } from "../hooks/useModal";
import RecycleBin from "../components/RecycleBin";
import { AccountSettings } from "../account";
import SortableManagementList from "../components/SortableManagementList";
import BackupPanel from "../components/BackupPanel";
import { useStore } from "../store";

type Panel = "categories" | "tags" | "backup" | "trash" | null;

export default function Settings() {
  const {
    settings,
    updateSettings,
    categories,
    tags,
    createCategory,
    updateCategory,
    reorderCategories,
    deleteCategory,
    createTag,
    updateTag,
    reorderTags,
    deleteTag,
  } = useStore();
  const [panel, setPanel] = useState<Panel>(null);
  const [newName, setNewName] = useState("");

  return (
    <div className="page settings-page">
      <header className="page-head">
        <div>
          <div className="eyebrow">MAKE IT YOURS.</div>
          <h1>偏好设置</h1>
          <p>按你的习惯，整理你的生活。</p>
        </div>
      </header>

      <section className="pro-card">
        <div>
          <strong>有物</strong>
          <p>记录拥有，看见每一天的价值。</p>
        </div>
        <div className="pro-emoji">
          <Layers3 size={44} strokeWidth={1} />
        </div>
      </section>

      <AccountSettings />
      <div className="section-label">数据与安全</div>
      <section className="card list-card">
        <Row
          icon={<Folder size={16} />}
          label="分类管理"
          value={`${categories.length}`}
          onClick={() => setPanel("categories")}
        />
        <Row
          icon={<Tags size={16} />}
          label="标签管理"
          value={`${tags.length}`}
          onClick={() => setPanel("tags")}
        />
        <Row
          icon={<Archive size={16} />}
          label="备份与恢复"
          value="导出 / 导入"
          onClick={() => setPanel("backup")}
        />
        <Row
          icon={<Trash2 size={16} />}
          label="回收站"
          value="查看 / 自动清空"
          onClick={() => setPanel("trash")}
        />
      </section>

      <div className="section-label">数值与单位</div>
      <section className="card list-card">
        <Field icon={<Banknote size={16} />} label="货币单位">
          <select
            className="inline-select"
            aria-label="货币单位"
            value={settings.currency}
            onChange={(e) => updateSettings({ currency: e.target.value })}
          >
            <option value="CNY">¥ CNY</option>
            <option value="USD">$ USD</option>
            <option value="EUR">€ EUR</option>
            <option value="JPY">¥ JPY</option>
            <option value="GBP">£ GBP</option>
            <option value="HKD">HK$ HKD</option>
          </select>
        </Field>
        <Field icon={<CircleDot size={16} />} label="小数点">
          <div className="segmented small">
            {([0, 1, 2] as const).map((d) => (
              <button
                key={d}
                className={settings.decimals === d ? "active" : ""}
                aria-pressed={settings.decimals === d}
                onClick={() => updateSettings({ decimals: d })}
              >
                保留 {d} 位
              </button>
            ))}
          </div>
        </Field>
        <Field icon={<Hash size={16} />} label="使用千位分隔符">
          <button
            className={`switch${settings.thousands ? " on" : ""}`}
            role="switch"
            aria-checked={settings.thousands}
            aria-label="使用千位分隔符"
            onClick={() => updateSettings({ thousands: !settings.thousands })}
          >
            <i />
          </button>
        </Field>
      </section>

      <div className="section-label">显示与外观</div>
      <section className="card list-card">
        <Field icon={<Contrast size={16} />} label="主题模式">
          <div className="segmented small">
            {(
              [
                ["system", "跟随系统"],
                ["light", "浅色"],
                ["dark", "深色"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                className={settings.theme === v ? "active" : ""}
                aria-pressed={settings.theme === v}
                onClick={() => updateSettings({ theme: v })}
              >
                {label}
              </button>
            ))}
          </div>
        </Field>
      </section>

      <div className="section-label">关于</div>
      <section className="card list-card">
        <Field icon={<Info size={16} />} label="版本">
          <span className="muted">0.2.0 · 设计预览版</span>
        </Field>
        <Field icon={<Database size={16} />} label="数据存储">
          <span className="muted">当前连接的数据服务</span>
        </Field>
      </section>

      <p className="footer-note">拥有恰好，生活刚好。</p>

      {panel === "categories" && (
        <Panel title="分类管理" onClose={() => setPanel(null)}>
          <div className="add-row">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="分类名称"
            />
            <button
              className="btn primary small"
              onClick={async () => {
                if (!newName.trim()) return;
                await createCategory({
                  name: newName.trim(),
                  icon: "",
                  color: "#007aff",
                  sort: categories.length,
                });
                setNewName("");
              }}
            >
              添加
            </button>
          </div>
          <SortableManagementList
            items={categories}
            label="分类"
            onReorder={reorderCategories}
            onRename={(c) => {
              const name = window.prompt("修改分类名称", c.name);
              if (name?.trim())
                void updateCategory(c.id, { name: name.trim() });
            }}
            onDelete={(c) => {
              if (window.confirm(`删除分类「${c.name}」？其下资产将变为未分类`))
                void deleteCategory(c.id);
            }}
          />
        </Panel>
      )}

      {panel === "tags" && (
        <Panel title="标签管理" onClose={() => setPanel(null)}>
          <div className="add-row">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="标签名称"
            />
            <button
              className="btn primary small"
              onClick={async () => {
                if (!newName.trim()) return;
                await createTag({
                  name: newName.trim(),
                  color: "#94A3B8",
                  sort: tags.length,
                });
                setNewName("");
              }}
            >
              添加
            </button>
          </div>
          <SortableManagementList
            items={tags}
            label="标签"
            onReorder={reorderTags}
            onRename={(t) => {
              const name = window.prompt("修改标签名称", t.name);
              if (name?.trim()) void updateTag(t.id, { name: name.trim() });
            }}
            onDelete={(t) => {
              if (window.confirm(`删除标签「${t.name}」？`))
                void deleteTag(t.id);
            }}
          />
        </Panel>
      )}

      {panel === "trash" && (
        <Panel title="回收站" onClose={() => setPanel(null)}>
          <RecycleBin />
        </Panel>
      )}

      {panel === "backup" && (
        <Panel title="备份与恢复" onClose={() => setPanel(null)}>
          <BackupPanel />
        </Panel>
      )}
    </div>
  );
}

function Field({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="field setting-row">
      <span className="setting-label">
        <span className="list-icon" aria-hidden="true">{icon}</span>
        {label}
      </span>
      {children}
    </div>
  );
}

function Row({
  icon,
  label,
  value,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  onClick: () => void;
}) {
  return (
    <button className="list-row" onClick={onClick}>
      <span className="list-icon" aria-hidden="true">{icon}</span>
      <span className="list-label">{label}</span>
      <span className="list-value">{value}</span>
      <span className="chevron">›</span>
    </button>
  );
}

function Panel({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useModal(onClose);
  return (
    <div className="sheet-backdrop">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="form-sheet"
      >
        <header className="form-header">
          <button className="link" onClick={onClose}>
            关闭
          </button>
          <strong>{title}</strong>
          <span style={{ width: 48 }} />
        </header>
        <div className="form-body">{children}</div>
      </div>
    </div>
  );
}
