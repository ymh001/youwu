import { Fragment } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Plus,
  Layers3,
  ArrowUpRight,
} from "lucide-react";
import { useUI } from "../ui";
import NavigationIcon, { type NavigationIconName } from "./NavigationIcon";
import "./TabBar.css";

const tabs: { to: string; label: string; shortLabel: string; icon: NavigationIconName }[] = [
  { to: "/", label: "我的资产", shortLabel: "资产", icon: "assets" },
  { to: "/wish", label: "心愿清单", shortLabel: "心愿", icon: "wish" },
  { to: "/trend", label: "数据趋势", shortLabel: "趋势", icon: "trend" },
  { to: "/settings", label: "偏好设置", shortLabel: "设置", icon: "settings" },
];
export default function TabBar() {
  const { openAdd } = useUI();
  const { pathname } = useLocation();
  const addType = pathname === "/wish" ? "wish" : "asset";
  return (
    <aside className="navigation mobile-navigation">
      <NavLink to="/" className="brand" aria-label="有物首页">
        <span className="brand-mark">
          <Layers3 size={23} />
        </span>
        <span>
          有物<span className="brand-en">个人资产管理</span>
        </span>
      </NavLink>
      <div className="nav-label">个人空间</div>
      <nav className="tabbar" aria-label="主导航">
        {tabs.map(({ to, label, shortLabel, icon }, index) => (
          <Fragment key={to}>
          {index === 2 && <button type="button" className="tab-add" aria-label={addType === "wish" ? "新增心愿" : "新增资产"} onClick={()=>openAdd(addType)}><Plus size={24}/></button>}
          <NavLink
            to={to}
            end={to === "/"}
            aria-label={label}
            className={({ isActive }) => `tab${isActive ? " active" : ""}`}
          >
            <NavigationIcon name={icon} />
            <span className="tab-desktop-label">{label}</span>
            <span className="tab-mobile-label">{shortLabel}</span>
          </NavLink>
          </Fragment>
        ))}
      </nav>
      <div className="nav-bottom">
        <div className="nav-note">
          <Layers3 size={24} strokeWidth={1.3} />
          <p>
            把喜欢的，
            <br />
            留在生活里。
          </p>
          <span>记录拥有，也看见价值。</span>
        </div>
        <NavLink className="nav-profile" to="/settings">
          <span className="avatar">有</span>
          <span>
            我的物品空间<small>有物 · 个人资产管理</small>
          </span>
          <ArrowUpRight size={16} />
        </NavLink>
      </div>
    </aside>
  );
}
