import http from "http";
import express from "express";
import { Server } from "socket.io";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import roomRoutes from "./routes/roomRoutes";
import messageRoutes from "./routes/messageRoutes";
import prisma from "./lib/prisma";
import { connectRedisPublisher } from "./lib/redisPublisher";
import { connectRedisSubscriber } from "./lib/redisSubscriber";
import { initSocket } from "./socket/index";

const app = express();
const port = Number(process.env.PORT) || 5000;
const instanceId = process.env.INSTANCE_ID || `chat-${port}`;

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

// REST endpoints (retained for backward compatibility and testing)
app.use("/internal/rooms", roomRoutes);
app.use("/internal/messages", messageRoutes);

app.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: "healthy",
      service: "chat-service",
      instanceId,
    });
  } catch (error) {
    res.status(503).json({ status: "unhealthy", error: String(error) });
  }
});

app.get("/", (_req, res) => {
  res.json({
    service: "ripple-chat-service",
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
  await connectRedisPublisher();
  await connectRedisSubscriber(io);
  initSocket(io);

  httpServer.listen(port, () => {
    console.log(`Chat Service [${instanceId}] listening on port ${port} (HTTP & WebSockets)`);
  });
}

start().catch((err) => {
  console.error(`Failed to start Chat Service [${instanceId}]:`, err);
  process.exit(1);
});
