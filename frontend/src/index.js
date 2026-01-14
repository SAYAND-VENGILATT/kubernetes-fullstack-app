import React from "react";
import ReactDOM from "react-dom/client";
import "./app.css";
import App from "./app";

// Create root and render the App
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);