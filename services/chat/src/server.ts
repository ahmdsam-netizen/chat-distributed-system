import express from "express";
import cors from "cors";
import helmet from "helmet";
import roomRoutes from "./routes/roomRoutes";
import messageRoutes from "./routes/messageRoutes";
import prisma from "./lib/prisma";
import { connectRedisPublisher } from "./lib/redisPublisher";

const app = express();
const port = Number(process.env.PORT) || 5000;

app.set("trust proxy", 1);
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors());
app.use(express.json());

app.use("/internal/rooms", roomRoutes);
app.use("/internal/messages", messageRoutes);

app.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: "healthy",
      service: "chat-service",
      instanceId: process.env.INSTANCE_ID || "chat-instance",
    });
  } catch (error) {
    res.status(503).json({ status: "unhealthy", error: String(error) });
  }
});

app.get("/", (_req, res) => {
  res.json({
    service: "ripple-chat-service",
    instanceId: process.env.INSTANCE_ID || "chat-instance",
    status: "running",
  });
});

async function start() {
  await connectRedisPublisher();
  app.listen(port, () => {
    console.log(`Chat Service [${process.env.INSTANCE_ID || "instance"}] listening on port ${port}`);
  });
}

start().catch((err) => {
  console.error("Failed to start Chat Service:", err);
  process.exit(1);
});
