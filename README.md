# chat-distributed-system

A modern, high-performance, horizontally scalable real-time chat application built with **React 19**, **Node.js / Express**, **Socket.io**, **Prisma 7 (PostgreSQL)**, and **Redis Pub/Sub**.

Ripple enables multi-room messaging, real-time typing indicators, active presence, backward cursor pagination, and **granular audience targeting (in-room whispers and member exclusions)** across distributed multi-instance clusters.

---

## Features & Highlights

- **Decoupled Architecture**: Independent frontend and backend workspaces managed with npm workspaces for seamless standalone deployments.
- **Targeted In-Room Whispers & Audience Control**:
  - Broadcast to everyone (`to : all`)
  - Whisper to specific members (`to : @user` or multiple users)
  - Selective exclusion (`except : @user` or multiple users)
  - Dynamic badge indicators and hover tooltips for message visibility
  - Strict server-side security: Excluded users never receive private payloads via WebSockets or historical database queries.
- **Horizontal Scalability with Redis Pub/Sub**: Deploy across multiple backend instances with synchronized message delivery and room management.
- **Safe Cursor-Based Pagination**: Fetch message history backward with cursor limits, ensuring new members only see messages sent after their join timestamp.
- **Auto-Reconnect & State Recovery**: Automatic room resubscription and channel synchronization on socket reconnects.
- **Cookie-Based JWT Authentication**: Secure HTTP-only cookies, password hashing with bcrypt, and socket authentication middleware.
- **Nginx Reverse Proxy & Load Balancer**: All client traffic enters through a single Nginx gateway (port 8080) which distributes requests across backend instances using `least_conn`. Backends are not directly exposed to the host.

---

## Architecture & Real-Time Data Flow

```mermaid
flowchart TD
    subgraph Clients["Clients (React 19 + Tailwind CSS 4)"]
        UserA["User A (Client 1)"]
        UserB["User B (Client 2)"]
        UserC["User C (Client 3)"]
    end

    Nginx["Nginx Reverse Proxy and Load Balancer (Port 8080)"]

    subgraph BackendCluster["Horizontally Scaled Backend Cluster"]
        Node1["Node.js Instance 1 (app1:3000)"]
        Node2["Node.js Instance 2 (app2:3000)"]
        Node3["Node.js Instance 3 (app3:3000)"]
    end

    subgraph Infrastructure["Shared State and Persistence"]
        Redis["Redis Pub/Sub (Channel: room:roomId)"]
        Postgres[("PostgreSQL Database (Prisma ORM)")]
    end

    UserA -->|"HTTP / WebSocket"| Nginx
    UserB -->|"HTTP / WebSocket"| Nginx
    UserC -->|"HTTP / WebSocket"| Nginx

    Nginx -->|"least_conn load balance"| Node1
    Nginx -->|"least_conn load balance"| Node2
    Nginx -->|"least_conn load balance"| Node3

    Node1 <-->|"Pub / Sub"| Redis
    Node2 <-->|"Pub / Sub"| Redis
    Node3 <-->|"Pub / Sub"| Redis

    Node1 -->|"Persist and Query"| Postgres
    Node2 -->|"Persist and Query"| Postgres
    Node3 -->|"Persist and Query"| Postgres
```

---

## Project Structure

```text
ripple/
├── backend/                        # Standalone Backend Service
│   ├── server.ts                   # Express & Socket.io entry point
│   ├── chatHandler.ts              # Redis publisher/subscriber connection & routing
│   ├── redisClient.ts              # Redis client instances
│   ├── server/
│   │   ├── auth.ts                 # JWT signing, cookie verification & auth middleware
│   │   └── routes/auth.ts          # /api/auth/signup, /signin, /signout, /me routes
│   ├── socket/
│   │   ├── index.ts                # Socket auth & connection handler
│   │   └── handlers/               # Event handlers (rooms, messages, pub/sub)
│   │       ├── messageHandler.ts   # Chat messages, typing, cursor pagination
│   │       ├── roomHandler.ts      # Room creation, joining, searching, rosters
│   │       └── pubsubEvents/       # Redis Pub/Sub event broadcasting logic
│   ├── lib/
│   │   ├── prisma.ts               # Prisma client singleton (pg adapter)
│   │   ├── reconnect.ts            # Socket reconnection sync logic
│   │   └── parseCookies.ts         # Raw cookie parser utility
│   ├── prisma/
│   │   ├── schema.prisma           # Database schema definition
│   │   └── migrations/             # PostgreSQL migration files
│   ├── prisma.config.ts            # Prisma 7 configuration
│   ├── Dockerfile                  # Production container definition
│   ├── tsconfig.json               # Backend TypeScript config
│   └── package.json
│
├── frontend/                       # Standalone Frontend SPA
│   ├── src/
│   │   ├── components/
│   │   │   ├── chat/ChatApp.tsx    # Real-time chat workspace & audience selector
│   │   │   └── ProtectedRoute.tsx  # Route guard for authenticated users
│   │   ├── contexts/
│   │   │   └── AuthContext.tsx     # Global user session & auth state
│   │   ├── pages/
│   │   │   └── AuthPages.tsx       # Sign In & Sign Up interfaces
│   │   ├── lib/
│   │   │   ├── api.ts              # REST API client
│   │   │   ├── socket.ts           # Socket.io connection manager
│   │   │   └── socket-types.ts     # Frontend TypeScript types & interfaces
│   │   ├── styles.css              # Tailwind CSS 4 setup & glassmorphism theme
│   │   ├── main.tsx                # React Router & application mount point
│   │   └── vite-env.d.ts
│   ├── index.html                  # HTML entry point
│   ├── vite.config.ts              # Vite config & dev proxy
│   ├── postcss.config.mjs          # PostCSS configuration
│   ├── Dockerfile                  # Frontend container definition
│   ├── tsconfig.json               # Frontend TypeScript config
│   └── package.json
│
├── nginx/                          # Nginx reverse proxy & load balancer
│   ├── Dockerfile                  # Builds nginx:alpine image with custom config baked in
│   └── nginx.conf                  # Upstream pool (app1/app2/app3) & WebSocket proxy config
├── docker-compose.yml              # Full stack with Nginx + 3 backends + Postgres + Redis
├── docker-compose-multiple.yml     # Alias for multi-instance cluster (same Nginx config)
├── package.json                    # Root npm workspaces orchestrator
└── README.md
```

---

## Quick Start (Local Development)

### Prerequisites
- **Node.js**: `v20+` or `v22+`
- **npm**: `v9+` or `v10+`
- **PostgreSQL**: Running locally or via Docker (`port 5432`)
- **Redis**: Running locally or via Docker (`port 6379`)

---

### 1. Clone & Install Dependencies
Install all workspace dependencies from the root directory:
```bash
git clone https://github.com/ahmdsam-netizen/Ripple.git
cd Ripple
npm install
```

---

### 2. Configure Environment Variables

#### Backend (`backend/.env`):
```env
PORT=3000
NODE_ENV=development
DATABASE_URL=postgresql://ripple:ripplepassword@localhost:5432/ripple
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-super-secret-jwt-key
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

#### Frontend (`frontend/.env`):
```env
# Leave blank during local development to leverage Vite proxy
VITE_API_URL=
VITE_SOCKET_URL=
```

---

### 3. Database Setup & Migrations
Run Prisma migrations to initialize your PostgreSQL schema:
```bash
cd backend
npx prisma migrate dev
cd ..
```

---

### 4. Start Development Servers
From the root directory, launch both backend and frontend concurrently:
```bash
npm run dev
```

| Service | URL | Description |
| :--- | :--- | :--- |
| **Frontend** | [http://localhost:5173](http://localhost:5173) | React 19 Client SPA (Vite dev server) |
| **Backend API** | [http://localhost:3000](http://localhost:3000) | REST Endpoints & WebSockets (direct, no Nginx in local dev) |

> **Note:** Nginx is only active in Docker (`docker compose up`). In local development (`npm run dev`), Vite's built-in proxy handles forwarding `/api` and `/socket.io` requests directly to the backend on `port 3000`.

Or run services individually:
- `npm run dev:backend` (runs only `backend`)
- `npm run dev:frontend` (runs only `frontend`)

---

## Docker Deployment

Both compose files now include **Nginx** as the single public entry point. Nginx listens on `port 8080` and load-balances traffic across three backend instances (`app1`, `app2`, `app3`) using the `least_conn` strategy. Backends are not directly exposed to the host — only Nginx is.

### Port Map

| Service | Host Port | Description |
| :--- | :--- | :--- |
| **Frontend** | `5173` | React 19 SPA (Vite dev server) |
| **Nginx** | `8080` | Single entry point for all API & WebSocket traffic |
| **PostgreSQL** | `5432` | Database (configurable via `DB_PORT`) |
| **Redis** | `6379` | Pub/Sub broker (configurable via `REDIS_PORT`) |

### Option A: `docker-compose.yml` — Full Stack
Starts everything in one command: **Nginx + 3 backend instances + PostgreSQL + Redis + Frontend**.
```bash
docker compose up --build
```

### Option B: `docker-compose-multiple.yml` — Backends Only (no frontend)
Starts only the infrastructure: **Nginx + 3 backend instances + PostgreSQL + Redis**. Use this when you want to run the frontend separately (e.g. `npm run dev:frontend`).
```bash
docker compose -f docker-compose-multiple.yml up --build
```

> **How it works inside Docker:** The frontend container sets `VITE_BACKEND_HOST=nginx` and `VITE_BACKEND_PORT=80`. Vite's proxy forwards all `/api` and `/socket.io` requests to the Nginx container, which then load-balances them across `app1`, `app2`, and `app3` using the `least_conn` strategy.

---

## Standalone Production Deployment

Because `backend/` and `frontend/` are completely decoupled, they can be deployed independently to different cloud providers.

### Deploying the Backend (Render, Railway, Fly.io, AWS, DigitalOcean)
Deploy only the `backend/` directory:

1. **Environment Variables**:
   - `PORT`: `3000` (or assigned by provider)
   - `NODE_ENV`: `production`
   - `DATABASE_URL`: Managed PostgreSQL connection string
   - `REDIS_URL`: Managed Redis connection string (e.g. Upstash, Redis Cloud)
   - `JWT_SECRET`: Strong secret key
   - `ALLOWED_ORIGINS`: `https://your-frontend-domain.vercel.app`
2. **Build Command**:
   ```bash
   npm ci && npm run build
   ```
3. **Start Command**:
   ```bash
   npx prisma migrate deploy && npm start
   ```

---

### Deploying the Frontend (Vercel, Netlify, Cloudflare Pages)
Deploy only the `frontend/` directory:

1. **Environment Variables**:
   - `VITE_API_URL`: `https://your-backend-api.com`
   - `VITE_SOCKET_URL`: `https://your-backend-api.com`
2. **Build Command**:
   ```bash
   npm run build
   ```
3. **Output Directory**:
   `dist`

---

## Socket.io API Reference

### Authentication
Sockets authenticate via HTTP-only cookie during handshake or via an explicit `authenticate` event.

| Event (Client &rarr; Server) | Payload | Description |
| :--- | :--- | :--- |
| `authenticate` | *(None)* | Authenticates socket using session cookie |

| Event (Server &rarr; Client) | Payload | Description |
| :--- | :--- | :--- |
| `authenticated` | `{ id: string }` | Successful authentication confirmation |
| `auth_error` | `{ message: string }` | Authentication failure |

---

### Room Events

| Event (Client &rarr; Server) | Payload | Description |
| :--- | :--- | :--- |
| `create_room` | `{ roomname: string, description: string }` | Creates a new chat room |
| `join_room` | `{ roomname: string }` | Joins an existing room |
| `leave_room` | `{ roomname: string }` | Leaves a room |
| `list_room` | `{ filter: string }` | Searches rooms matching filter |
| `get_room_members` | `{ roomname: string }` | Retrieves active member list |

| Event (Server &rarr; Client) | Payload | Description |
| :--- | :--- | :--- |
| `room_created` | `{ roomname: string, description: string }` | Room creation success |
| `filter_rooms` | `FilterRoom[]` | Search results with member counts |
| `room_members` | `{ roomname: string, members: Member[] }` | Room member roster |

---

### Messaging & Audience Control

| Event (Client &rarr; Server) | Payload | Description |
| :--- | :--- | :--- |
| `message_in_room` | `{ text: string, roomname: string, target_mode?: 'all' \| 'to' \| 'not_to' \| 'not_to_all', target_users?: string[] }` | Sends an in-room message with audience filter |
| `typing_in_room` | `{ roomname: string }` | Triggers typing indicator |
| `get_message_of_room` | `{ roomname: string, cursor?: string, limit?: number }` | Paginated message fetch |

| Event (Server &rarr; Client) | Payload | Description |
| :--- | :--- | :--- |
| `message_in_room` | `{ id: string, content: string, sent_at: string, sent_by: string, sent_to: string, target_mode: string, target_users: string[] }` | Incoming real-time message |
| `group_chat` | `{ roomname: string, messages: Message[], hasMore: boolean, nextCursor: string \| null, isInitial: boolean }` | Paginated message chunk response |
| `typing_in_room` | `{ username: string, roomname: string }` | Real-time typing notification |

---

## Available NPM Scripts

### Root Monorepo
- `npm run dev`: Run both backend and frontend concurrently
- `npm run dev:backend`: Run backend only
- `npm run dev:frontend`: Run frontend only
- `npm run build`: Build both backend and frontend for production
- `npm run lint`: Type-check all workspaces

### Backend Workspace (`cd backend`)
- `npm run dev`: Run server via `tsx`
- `npm run build`: Generate Prisma client
- `npm run start`: Run production server
- `npm run db:migrate`: Run Prisma migrations for development
- `npm run db:deploy`: Apply migrations in production

### Frontend Workspace (`cd frontend`)
- `npm run dev`: Start Vite development server
- `npm run build`: Type-check and compile Vite bundle into `dist/`
- `npm run preview`: Preview production build locally

---
