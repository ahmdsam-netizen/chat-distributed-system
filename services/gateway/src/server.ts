import http from "http";
import express from "express";
import { Server } from "socket.io";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { connectRedisSubscriber } from "./lib/redisSubscriber";
import { initSocket } from "./socket/index";

const app = express();
const port = Number(process.env.PORT) || 3000;
const instanceId = process.env.INSTANCE_ID || `gateway-${port}`;

app.set("trust proxy", 1);

const defaultOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:8080",
];

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : defaultOrigins;

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`CORS policy: origin ${origin} not allowed`));
    },
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

app.get("/health", (_req, res) => {
  res.json({
    status: "healthy",
    service: "gateway-service",
    instanceId,
  });
});

app.get("/", (_req, res) => {
  res.json({
    service: "ripple-gateway-service",
    instanceId,
    status: "running",
  });
});

const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket", "polling"],
});

async function start() {
  await connectRedisSubscriber(io);
  initSocket(io);

  httpServer.listen(port, () => {
    console.log(`Gateway [${instanceId}] listening on port ${port}`);
  });
}

start().catch((err) => {
  console.error(`Failed to start Gateway [${instanceId}]:`, err);
  process.exit(1);
});
