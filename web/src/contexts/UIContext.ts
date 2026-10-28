import { createContext } from "react";

export interface UIValue {
  openAdd: (type?: "asset" | "wish") => void;
  openAccessory: (parentId: string) => void;
  openConvertWish: (assetId: string) => void;
  openEdit: (assetId: string) => void;
  openCopy: (sourceId: string) => void;
}

export const UIContext = createContext<UIValue | null>(null);
