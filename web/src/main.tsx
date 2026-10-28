import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AccountGate } from "./account";
import { StoreProvider } from "./store";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AccountGate><StoreProvider>
        <App />
      </StoreProvider></AccountGate>
    </BrowserRouter>
  </React.StrictMode>,
);
