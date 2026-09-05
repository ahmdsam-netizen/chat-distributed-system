import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import authRoutes from "./routes/auth";
import prisma from "./lib/prisma";

const app = express();
const port = Number(process.env.PORT) || 4000;

app.set("trust proxy", 1);

const defaultOrigins = ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:8080"];
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

app.use("/api/auth", authRoutes);

app.get("/api/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "healthy", service: "auth-service" });
  } catch (error) {
    res.status(503).json({ status: "unhealthy", error: String(error) });
  }
});

app.get("/", (_req, res) => {
  res.json({ service: "ripple-auth-service", status: "running" });
});

app.listen(port, () => {
  console.log(`Auth Service listening on port ${port}`);
});
