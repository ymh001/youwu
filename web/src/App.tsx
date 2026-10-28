import { Route, Routes, useLocation } from "react-router-dom";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { useEffect } from "react";
import { Plus, Layers3 } from "lucide-react";
import TabBar from "./components/TabBar";
import Detail from "./pages/Detail";
import Home from "./pages/Home";
import Settings from "./pages/Settings";
import Trend from "./pages/Trend";
import Wish from "./pages/Wish";
import { UIProvider, useUI } from "./ui";

function Workspace() {
  const location = useLocation();
  const { openAdd } = useUI();
  const name = location.pathname.startsWith("/asset/")
    ? "资产详情"
    : {
        "/": "我的资产",
        "/wish": "心愿清单",
        "/trend": "数据趋势",
        "/settings": "偏好设置",
      }[location.pathname] || "我的资产";
  useEffect(() => {
    window.scrollTo({ top: 0 });
    document.title = `${name} · 有物`;
  }, [location.pathname, name]);
  return (
    <div className="app-shell">
      <TabBar />
      <main className="workspace">
        <header className="workspace-bar">
          <div className="breadcrumb">
            <Layers3 size={17} />
            <span>个人空间</span>
            <span className="breadcrumb-slash">/</span>
            <strong>{name}</strong>
          </div>
          <div className="workspace-actions">
            <span className="today-label">
              {new Intl.DateTimeFormat("zh-CN", {
                month: "long",
                day: "numeric",
                weekday: "long",
              }).format(new Date())}
            </span>
            <button
              className="btn primary"
              onClick={() =>
                openAdd(location.pathname === "/wish" ? "wish" : "asset")
              }
            >
              <Plus size={17} />
              新增{location.pathname === "/wish" ? "心愿" : "资产"}
            </button>
          </div>
        </header>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            className="route-content"
            initial={{ opacity: 0, y: 9 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.18 }}
          >
            <Routes location={location}>
              <Route path="/" element={<Home />} />
              <Route path="/asset/:id" element={<Detail />} />
              <Route path="/wish" element={<Wish />} />
              <Route path="/trend" element={<Trend />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Home />} />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <UIProvider>
        <Workspace />
      </UIProvider>
    </MotionConfig>
  );
}
