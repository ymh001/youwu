import { Heart } from "lucide-react";
import WishList from "../components/WishList";
import { useStore } from "../store";
import { useUI } from "../ui";

export default function Wish() {
  const { wishes, stats, money, loading } = useStore();
  const { openAdd } = useUI();

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">SOMETHING TO LOOK FORWARD TO.</div>
          <h1>心愿清单</h1>
          <p>给下一份喜欢，留一个位置。</p>
        </div>
      </header>

      <section className="card wish-total">
        <div>
          <label>心愿总值</label>
          <strong>{money(stats?.wish_total ?? 0)}</strong>
          <div className="muted small">
            心愿数量：{stats?.wish_count ?? wishes.length}
          </div>
        </div>
        <div className="wish-jar">
          <Heart size={65} strokeWidth={0.8} />
        </div>
      </section>

      {loading ? (
        <div className="empty">加载中…</div>
      ) : wishes.length === 0 ? (
        <div className="empty">
          <div className="empty-emoji">✨</div>
          <p>还没有心愿，先记下一个想要的东西</p>
          <button className="btn primary" onClick={() => openAdd("wish")}>
            新增心愿
          </button>
        </div>
      ) : (
        <WishList />
      )}

      <button
        className="btn ghost block add-wish"
        onClick={() => openAdd("wish")}
      >
        + 新增心愿
      </button>
    </div>
  );
}
