import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In Docker, VITE_BACKEND_HOST is set to the nginx service name ("nginx").
// Nginx listens on port 80 inside Docker (mapped to 8080 on the host).
// Locally (without Docker), it falls back to "localhost:8080" (nginx running via docker compose).
const backendHost = process.env.VITE_BACKEND_HOST ?? "localhost";
const backendPort = process.env.VITE_BACKEND_PORT ?? "8080";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // Required to expose Vite dev server outside Docker container
    proxy: {
      // All API and WebSocket traffic goes through Nginx, which load-balances to app1/app2/app3
      "/api": `http://${backendHost}:${backendPort}`,
      "/socket.io": { target: `ws://${backendHost}:${backendPort}`, ws: true },
    },
  },
});
