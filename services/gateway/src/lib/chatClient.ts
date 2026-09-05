const CHAT_LB_URL = process.env.CHAT_LB_URL || "http://chat-lb:5000";

async function postJson<T>(path: string, body: any): Promise<T> {
  const url = `${CHAT_LB_URL}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `HTTP error ${res.status}`);
  }
  return data as T;
}

async function getJson<T>(path: string): Promise<T> {
  const url = `${CHAT_LB_URL}${path}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `HTTP error ${res.status}`);
  }
  return data as T;
}

export const chatClient = {
  createRoom: (user: { id: string; username: string }, data: { roomname: string; description?: string }) =>
    postJson<{ roomname: string; roomId: string }>("/internal/rooms/create", { user, ...data }),

  joinRoom: (user: { id: string; username: string }, data: { roomname: string }) =>
    postJson<{ roomname: string; roomId: string }>("/internal/rooms/join", { user, ...data }),

  leaveRoom: (user: { id: string; username: string }, data: { roomname: string }) =>
    postJson<{ roomname: string; roomId: string; deleted?: boolean }>("/internal/rooms/leave", { user, ...data }),

  listRooms: (user: { id: string; username: string }, filter?: string) =>
    postJson<any[]>("/internal/rooms/list", { user, filter }),

  getRoomMembers: (user: { id: string; username: string }, roomname: string) =>
    postJson<{ roomname: string; members: any[] }>("/internal/rooms/members", { user, roomname }),

  getUserRooms: (userId: string) =>
    getJson<{ id: string; roomname: string }[]>(`/internal/rooms/user-rooms/${userId}`),

  sendMessage: (
    user: { id: string; username: string },
    data: { text: string; roomname: string; target_mode?: string; target_users?: string[] }
  ) => postJson<{ id: string; sent_at: string; roomId: string }>("/internal/messages/send", { user, ...data }),

  sendTyping: (user: { id: string; username: string }, data: { roomname: string }) =>
    postJson<{ success: boolean }>("/internal/messages/typing", { user, ...data }),

  getMessages: (
    user: { id: string; username: string },
    data: { roomname: string; cursor?: string; limit?: number }
  ) => postJson<{ roomname: string; messages: any[]; hasMore: boolean; nextCursor: string | null; isInitial: boolean }>(
    "/internal/messages/history",
    { user, ...data }
  ),
};
