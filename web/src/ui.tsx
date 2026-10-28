import {
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import AssetForm from "./components/AssetForm";
import { UIContext, type UIValue } from "./contexts/UIContext";

export function UIProvider({ children }: { children: ReactNode }) {
  const [sheet, setSheet] = useState<{
    open: boolean;
    type: "asset" | "wish";
    assetId?: string;
    sourceId?: string;
    parentId?: string;
    convertWish?: boolean;
  }>({
    open: false,
    type: "asset",
  });

  const openAdd = useCallback((type: "asset" | "wish" = "asset") => {
    setSheet({ open: true, type });
  }, []);

  const openEdit = useCallback((assetId: string) => {
    setSheet({ open: true, type: "asset", assetId });
  }, []);

  const openConvertWish = useCallback((assetId:string)=>setSheet({open:true,type:"asset",assetId,convertWish:true}),[]);

  const openCopy = useCallback(
    (sourceId: string) => setSheet({ open: true, type: "asset", sourceId }),
    [],
  );
  const openAccessory = useCallback((parentId: string) => setSheet({open:true,type:"asset",parentId}), []);
  const value = useMemo(
    () => ({ openAdd, openEdit, openCopy, openAccessory, openConvertWish }),
    [openAdd, openEdit, openCopy, openAccessory, openConvertWish],
  );

  return (
    <UIContext.Provider value={value}>
      {children}
      <AnimatePresence>
        {sheet.open && (
          <motion.div
            className="sheet-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <AssetForm
              assetId={sheet.assetId}
              sourceId={sheet.sourceId}
              parentId={sheet.parentId}
              convertWish={sheet.convertWish}
              defaultType={sheet.type}
              onClose={() => setSheet((s) => ({ ...s, open: false }))}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </UIContext.Provider>
  );
}

export function useUI(): UIValue {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error("useUI must be used within UIProvider");
  return ctx;
}
