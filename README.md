# chat-distributed-system

A modern, high-performance, horizontally scalable real-time chat application built with **React 19**, **Node.js / Express**, **Socket.io**, **Prisma 7 (PostgreSQL)**, **Redis Pub/Sub**, and **Nginx Load Balancer** in a **Distributed Microservices Architecture**.

Ripple enables multi-room messaging, real-time typing indicators, active presence, backward cursor pagination, and **granular audience targeting (in-room whispers and member exclusions)** across distributed multi-instance clusters.

---

## Features & Highlights

- **Microservices Decomposition**: Decoupled into specialized services:
  - **Auth Service**: Dedicated user authentication, password hashing, and cookie JWT management.
  - **Horizontally Scaled Chat Cluster**: Direct WebSocket termination, in-memory chat domain logic, room management, message persistence, and real-time event broadcasting.
  - **Edge Nginx Reverse Proxy**: Single public entry point (`port 8080`) that transparently distributes client WebSockets directly across the Chat Cluster using `ip_hash` (sticky sessions) and routes `/api/auth/*` directly to the Auth Service.
- **Targeted In-Room Whispers & Audience Control**:
  - Broadcast to everyone (`to : all`)
  - Whisper to specific members (`to : @user` or multiple users)
  - Selective exclusion (`except : @user` or multiple users)
  - Dynamic badge indicators and hover tooltips for message visibility
  - Strict server-side security: Excluded users never receive private payloads via WebSockets or historical database queries.
- **Horizontal Scalability with Redis Pub/Sub (M:N Architecture)**:
  - Chat servers publish events to Redis room channels (`room:roomId`).
  - Chat servers subscribe to channels dynamically when local clients are present.
  - Redis synchronizes messages across all chat instances, which deliver down to local client sockets.
- **Safe Cursor-Based Pagination**: Fetch message history backward with cursor limits, ensuring new members only see messages sent after their join timestamp.
- **Auto-Reconnect & State Recovery**: Automatic room resubscription and channel synchronization on socket reconnects.
- **Cookie-Based JWT Authentication**: Secure HTTP-only cookies, password hashing with bcrypt, socket authentication middleware, and automatic rerouting of unauthenticated users to `/signin`.

---

## Architecture & Real-Time Data Flow

```mermaid
flowchart TD
    subgraph Clients["Clients (React 19 + Tailwind CSS 4)"]
        UserA["User A (Browser 1)"]
        UserB["User B (Browser 2)"]
    end

    EdgeNginx["Edge Nginx Load Balancer (Port 8080)"]

    AuthSvc["Auth Service (auth-service:4000)"]

    subgraph ChatCluster["Horizontally Scaled Chat Cluster"]
        Chat1["Chat Service 1 (chat1:5000)"]
        Chat2["Chat Service 2 (chat2:5000)"]
    end

    subgraph Infrastructure["Shared State & Pub/Sub"]
        Redis["Redis Pub/Sub (Channel: room:roomId)"]
        Postgres[("PostgreSQL Database (Prisma ORM)")]
    end

    UserA -->|"HTTP / WebSocket"| EdgeNginx
    UserB -->|"HTTP / WebSocket"| EdgeNginx

    EdgeNginx -->|"/api/auth/*"| AuthSvc
    EdgeNginx -->|"/socket.io/* (ip_hash)"| Chat1
    EdgeNginx -->|"/socket.io/* (ip_hash)"| Chat2

    AuthSvc -->|"User Accounts"| Postgres
    Chat1 -->|"Rooms & Messages"| Postgres
    Chat2 -->|"Rooms & Messages"| Postgres

    Chat1 <-->|"Publish & Subscribe"| Redis
    Chat2 <-->|"Publish & Subscribe"| Redis
```

---

## Project Structure

```text
ripple/
├── services/
│   ├── auth/                           # Dedicated Authentication Service
│   │   ├── src/
│   │   │   ├── server.ts               # Express auth server (port 4000)
│   │   │   ├── routes/auth.ts          # /api/auth/signup, /signin, /signout, /me
│   │   │   ├── lib/auth.ts             # JWT signing, cookie verification & middleware
│   │   │   └── lib/prisma.ts           # Prisma client for User model
│   │   ├── prisma/schema.prisma        # User schema
│   │   └── Dockerfile
│   │
│   └── chat/                           # Horizontally Scaled Chat / WebSocket Service
│       ├── src/
│       │   ├── server.ts               # Express & Socket.io server (port 5000)
│       │   ├── auth/
│       │   │   └── tokenVerifier.ts    # Cookie parsing & JWT verification
│       │   ├── socket/
│       │   │   ├── index.ts            # Socket.io auth handshake & room sync
│       │   │   └── handlers.ts         # In-memory event dispatchers
│       │   ├── logic/
│       │   │   ├── roomLogic.ts        # Room business logic & Redis publish
│       │   │   └── messageLogic.ts     # Message validation, DB persistence & Redis publish
│       │   ├── lib/
│       │   │   ├── redisPublisher.ts   # Redis publisher client
│       │   │   ├── redisSubscriber.ts  # Dynamic Redis room subscriptions
│       │   │   ├── eventRouter.ts      # Whispers & audience targeting router
│       │   │   └── prisma.ts           # Prisma client for Room & Message models
│       │   ├── routes/                 # REST endpoints (rooms & messages)
│       │   ├── prisma/
│       │   │   ├── schema.prisma       # Room, RoomMember, RoomMessage schema
│       │   │   └── migrations/         # PostgreSQL migration files
│       │   └── Dockerfile
│       └── Dockerfile
│
├── nginx/
│   └── edge/                           # Edge Reverse Proxy & Load Balancer (port 8080)
│       ├── nginx.conf                  # Routes /api/auth to auth-service & /socket.io to chat cluster
│       └── Dockerfile
│
├── frontend/                           # Standalone React 19 SPA
├── docker-compose.yml                  # Full stack microservices cluster
├── docker-compose-multiple.yml         # Multi-service stack (with frontend)
├── package.json                        # Root npm workspaces orchestrator
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

Create `.env` in the root directory:
```env
PORT=5000
NODE_ENV=development
DB_USER=ripple
DB_PASSWORD=ripplepassword
DB_NAME=ripple
DATABASE_URL=postgresql://ripple:ripplepassword@localhost:5432/ripple
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-super-secret-jwt-key
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080
```

---

### 3. Database Setup & Migrations
Run Prisma migrations using the Chat service:
```bash
cd services/chat
npx prisma migrate dev
cd ../..
```

Generate Prisma clients for Auth and Chat services:
```bash
npm run build --workspace=services/auth
npm run build --workspace=services/chat
```

---

### 4. Start Development Servers
From the root directory, launch all microservices and the frontend concurrently:
```bash
npm run dev
```

Or run services individually:
- `npm run dev:auth` (Auth Service on port 4000)
- `npm run dev:chat` (Chat Service on port 5000)
- `npm run dev:frontend` (React 19 Frontend on port 5173)

---

## Docker Deployment

The entire microservices stack is orchestrated via Docker Compose. **Edge Nginx** serves as the public entry point on `port 8080`, transparently load balancing WebSocket traffic across Chat instances and routing auth requests.

### Port Map

| Service | Host Port | Internal Port | Description |
| :--- | :--- | :--- | :--- |
| **Edge Nginx** | `8080` | `80` | Single public entry point for all API & WebSocket traffic |
| **Frontend** | `5173` | `5173` | React 19 Client SPA (Vite dev server) |
| **Auth Service** | — | `4000` | User authentication & credential management |
| **Chat 1 & 2** | — | `5000` | Real-time WebSockets, chat domain logic & room management |
| **PostgreSQL** | `5432` | `5432` | Primary database (`postgres:16-alpine`) |
| **Redis** | `6379` | `6379` | Pub/Sub message broker |

### Option A: `docker-compose.yml`
Starts the complete cluster:
```bash
docker compose up --build
```

### Option B: `docker-compose-multiple.yml`
Alternative compose configuration:
```bash
docker compose -f docker-compose-multiple.yml up --build
```

> **Clean start after volume changes:** If resetting the database volume, run:
> ```bash
> docker compose down -v
> docker compose up --build
> ```

---

## Socket.io API Reference

### Authentication
Sockets authenticate via HTTP-only cookie during handshake. If unauthenticated, the connection is rejected with `UNAUTHENTICATED`, automatically redirecting the client to `/signin`.

| Event (Client &rarr; Server) | Payload | Description |
| :--- | :--- | :--- |
| `authenticate` | *(None)* | Re-authenticates socket using session cookie |

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
| `room_created` | `{ roomname: string }` | Room creation success |
| `joined_room` | `{ roomname: string }` | Room join success |
| `left_room` | `{ roomname: string }` | Room leave success |
| `filter_rooms` | `FilterRoom[]` | Search results with member counts |
| `room_members` | `{ roomname: string, members: Member[] }` | Room member roster |
| `room_deleted` | `{ roomname: string, roomId: string }` | Broadcast when empty room is deleted |

---

### Messaging & Audience Control

| Event (Client &rarr; Server) | Payload | Description |
| :--- | :--- | :--- |
| `message_in_room` | `{ text: string, roomname: string, target_mode?: 'all' \| 'to' \| 'not_to' \| 'not_to_all', target_users?: string[] }` | Sends an in-room message with audience filter |
| `typing_in_room` | `{ roomname: string }` | Triggers typing indicator |
| `get_message_of_room` | `{ roomname: string, cursor?: string, limit?: number }` | Paginated message fetch |

| Event (Server &rarr; Client) | Payload | Description |
| :--- | :--- | :--- |
| `chat` | `{ id: string, content: string, sent_at: string, sent_by: string, sent_to: string, target_mode: string, target_users: string[] }` | Incoming real-time message |
| `group_chat` | `{ roomname: string, messages: Message[], hasMore: boolean, nextCursor: string \| null, isInitial: boolean }` | Paginated message chunk response |
| `typing` | `{ username: string, roomname: string }` | Real-time typing notification |
| `error` | `{ message: string }` | Operation error notification |

---

## Available NPM Scripts

### Root Monorepo
- `npm run dev`: Run all microservices (`auth`, `chat`) and `frontend` concurrently
- `npm run dev:auth`: Run Auth Service only
- `npm run dev:chat`: Run Chat Service only
- `npm run dev:frontend`: Run React Frontend only
- `npm run build`: Build all workspaces for production
- `npm run lint`: Type-check all workspaces with TypeScript
