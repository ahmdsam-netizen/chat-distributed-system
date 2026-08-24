export type ChatMessage = {
  id?: string;
  type?: "chat" | "system" | string;
  target_mode?: "all" | "to" | "not_to" | string;
  target_users?: string[];
  content: string;
  sent_at: string;
  sent_by: string;
  sent_to: string;
};

export type GroupChatPayload = {
  roomname: string;
  messages: ChatMessage[];
  hasMore: boolean;
  nextCursor: string | null;
  isInitial: boolean;
};

export type RoomMemberInfo = {
  id: string;
  username: string;
  joined_at: string;
};

export type FilterRoom = {
  roomname: string;
  description?: string | null;
  admin: string;
  created_at: string;
  members: number;
  isMember?: boolean;
};

export type ActiveChat = { type: "room"; roomname: string } | null;




