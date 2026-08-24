import { FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { disconnectSocket, getSocket } from "../../lib/socket";
import type { ActiveChat, ChatMessage, FilterRoom, GroupChatPayload, RoomMemberInfo } from "../../lib/socket-types";

const time = (date: string) => {
  try {
    return new Date(date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
};

function getAudienceBadge(
  message: ChatMessage,
  currentUsername?: string
): { label: string; style: string; tooltip?: string } {
  const isMe = message.sent_by === currentUsername;
  const mode = message.target_mode;
  const users = message.target_users ?? [];

  // If "all" or empty users list (or unconfigured): "to : all" (No hover tooltip)
  if (!mode || mode === "all" || (mode !== "not_to_all" && users.length === 0)) {
    return {
      label: "to : all",
      style: "bg-black/25 text-slate-300 border-slate-700/40"
    };
  }

  // If "not_to_all" (excluding all room members): "not to : all" (No hover tooltip)
  if (mode === "not_to_all") {
    return {
      label: "not to : all",
      style: "bg-black/25 text-rose-300 border-rose-400/30 font-medium"
    };
  }

  // If "to" (selective delivery)
  if (mode === "to") {
    if (users.length === 1) {
      const recipient = users[0];
      if (isMe) {
        // Sender view: "to: @receiver" (No hover tooltip needed)
        return {
          label: `to: @${recipient}`,
          style: "bg-black/35 text-amber-300 border-amber-400/30 font-medium"
        };
      } else {
        // Receiver view: "to: you" (No hover tooltip needed)
        return {
          label: "to: you",
          style: "bg-black/35 text-amber-300 border-amber-400/30 font-medium"
        };
      }
    } else {
      // Multiple specific recipients: provide hover tooltip with usernames
      const userListText = users.map(u => `@${u}`).join(", ");
      if (isMe) {
        // Sender view: "to: y people"
        return {
          label: `to: ${users.length} people`,
          style: "bg-black/35 text-amber-300 border-amber-400/30 font-medium cursor-help",
          tooltip: `Recipients: ${userListText}`
        };
      } else {
        // Receiver view: "to: you and x others"
        const othersCount = users.length - 1;
        return {
          label: `to: you and ${othersCount} ${othersCount === 1 ? "other" : "others"}`,
          style: "bg-black/35 text-amber-300 border-amber-400/30 font-medium cursor-help",
          tooltip: `Recipients: ${userListText}`
        };
      }
    }
  }

  // If "not_to" (exclusion delivery of specific people)
  if (mode === "not_to") {
    if (users.length === 1) {
      return {
        label: `except: @${users[0]}`,
        style: "bg-black/35 text-rose-300 border-rose-400/30 font-medium"
      };
    } else {
      // Multiple specific exclusions: provide hover tooltip with excluded usernames
      const userListText = users.map(u => `@${u}`).join(", ");
      return {
        label: `except: ${users.length} people`,
        style: "bg-black/35 text-rose-300 border-rose-400/30 font-medium cursor-help",
        tooltip: `Excluded: ${userListText}`
      };
    }
  }

  return {
    label: "to : all",
    style: "bg-black/25 text-slate-300 border-slate-700/40"
  };
}

export default function ChatApp() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rooms, setRooms] = useState<FilterRoom[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [active, setActive] = useState<ActiveChat>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [roomFilter, setRoomFilter] = useState("");
  const [draft, setDraft] = useState("");
  const [roomname, setRoomname] = useState("");
  const [description, setDescription] = useState("");
  const [typing, setTyping] = useState<string | null>(null);

  // Targeted Messaging State
  const [targetMode, setTargetMode] = useState<"to" | "not_to">("to");
  const [targetUsers, setTargetUsers] = useState<string[]>([]);
  const [roomMembers, setRoomMembers] = useState<RoomMemberInfo[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [showMemberDropdown, setShowMemberDropdown] = useState(false);

  const activeRef = useRef(active);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTyping = useRef(0);
  const end = useRef<HTMLDivElement>(null);
  const scrollContainer = useRef<HTMLDivElement>(null);
  activeRef.current = active;

  const refreshRooms = (filter = "") => getSocket().emit("list_room", { filter });

  useEffect(() => {
    const socket = getSocket();
    const messageKey = (m: ChatMessage) => m.id ?? `${m.sent_at}-${m.sent_by}-${m.content}`;

    socket.on("connect", () => socket.emit("authenticate"));
    socket.on("authenticated", () => {
      setConnected(true);
      setError(null);
      refreshRooms();
    });
    socket.on("auth_error", (payload: { message?: string }) => {
      setError(payload.message ?? "Not authenticated");
      setConnected(false);
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", e => {
      setError(e.message);
      setConnected(false);
    });

    socket.on("filter_rooms", setRooms);

    socket.on("room_members", (payload: { roomname: string; members: RoomMemberInfo[] }) => {
      if (activeRef.current?.roomname === payload.roomname) {
        setRoomMembers(payload.members);
      }
    });

    socket.on("group_chat", (payload: GroupChatPayload) => {
      if (activeRef.current?.roomname !== payload.roomname) return;
      setHasMore(payload.hasMore);
      setNextCursor(payload.nextCursor);
      setLoadingOlder(false);

      if (payload.isInitial) {
        setMessages(payload.messages);
      } else {
        setMessages(prev => {
          const existingKeys = new Set(prev.map(messageKey));
          const newUnique = payload.messages.filter(m => !existingKeys.has(messageKey(m)));
          return [...newUnique, ...prev];
        });
      }
    });

    socket.on("chat", (payload: {
      id?: string;
      type?: string;
      target_mode?: string;
      target_users?: string[];
      member_change?: "join" | "leave";
      member?: RoomMemberInfo;
      from: string;
      to: string;
      text: string;
      sent_at: string;
    }) => {
      const chat = activeRef.current;
      if (!chat) return;
      if (chat.roomname === payload.to) {
        // Handle instant live member updates
        if (payload.member_change === "join" && payload.member) {
          const newMember = payload.member;
          setRoomMembers(prev =>
            prev.some(m => m.username === newMember.username) ? prev : [...prev, newMember]
          );
        } else if (payload.member_change === "leave" && payload.member) {
          const leftUsername = payload.member.username;
          setRoomMembers(prev => prev.filter(m => m.username !== leftUsername));
          setTargetUsers(prev => prev.filter(u => u !== leftUsername));
        }

        // Re-sync authoritative room members and room counts on any system event
        if (payload.type === "system") {
          getSocket().emit("get_room_members", { roomname: payload.to });
          refreshRooms();
        }

        setMessages(prev => {
          const message: ChatMessage = {
            id: payload.id,
            type: (payload.type as "chat" | "system") ?? "chat",
            target_mode: payload.target_mode,
            target_users: payload.target_users,
            content: payload.text,
            sent_at: payload.sent_at,
            sent_by: payload.from,
            sent_to: payload.to,
          };
          const key = messageKey(message);
          return prev.some(item => messageKey(item) === key) ? prev : [...prev, message];
        });
      }
    });


    socket.on("typing", (payload: { username: string; roomname?: string }) => {
      const chat = activeRef.current;
      if (!chat || payload.username === user?.username || payload.roomname !== chat.roomname) return;
      setTyping(payload.username);
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setTyping(null), 2500);
    });

    socket.on("room_created", (payload: { roomname: string }) => {
      setNotice(`Created room “${payload.roomname}”`);
      selectRoom(payload.roomname);
      refreshRooms();
    });

    socket.on("joined_room", (payload: { roomname: string }) => {
      setNotice(`Joined “${payload.roomname}”`);
      setError(null);
      setRooms(prev =>
        prev.map(r =>
          r.roomname === payload.roomname ? { ...r, isMember: true, members: r.members + 1 } : r
        )
      );
      setActive({ type: "room", roomname: payload.roomname });
      setMessages([]);
      setHasMore(false);
      setNextCursor(null);
      setTyping(null);
      setTargetUsers([]);
      getSocket().emit("get_message_of_room", { roomname: payload.roomname, limit: 30 });
      getSocket().emit("get_room_members", { roomname: payload.roomname });
      refreshRooms();
    });

    socket.on("left_room", (payload?: { roomname?: string }) => {
      setError(null);
      if (payload?.roomname) {
        setRooms(prev =>
          prev.map(r =>
            r.roomname === payload.roomname ? { ...r, isMember: false, members: Math.max(0, r.members - 1) } : r
          )
        );
      }
      refreshRooms();
    });

    // Only reset active chat if the deleted room is the one the user currently has open
    socket.on("room_deleted", (payload: { roomname: string }) => {
      if (activeRef.current && activeRef.current.roomname === payload.roomname) {
        setActive(null);
        setNotice(`Room #${payload.roomname} was deleted`);
      }
      refreshRooms();
    });

    socket.on("error", (payload: { message?: string } | string) => {
      const msg = typeof payload === "string" ? payload : payload.message ?? "Socket error";
      // Ignore "not a member" error in header banner since the chat view already handles non-member state cleanly
      if (msg.toLowerCase().includes("not a member") || msg.toLowerCase().includes("does not exist or not a member")) {
        return;
      }
      setError(msg);
    });

    socket.connect();

    return () => {
      if (typingTimer.current) clearTimeout(typingTimer.current);
      disconnectSocket();
    };
  }, [user?.username]);

  useEffect(() => {
    const id = setTimeout(() => refreshRooms(roomFilter), 250);
    return () => clearTimeout(id);
  }, [roomFilter]);

  useEffect(() => {
    if (!loadingOlder) {
      end.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, typing]);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 3000);
    return () => clearTimeout(id);
  }, [notice]);

  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(id);
  }, [error]);

  function selectRoom(name: string) {
    setError(null);
    setActive({ type: "room", roomname: name });
    setMessages([]);
    setHasMore(false);
    setNextCursor(null);
    setTyping(null);
    setTargetUsers([]);
    setMemberSearch("");
    setShowMemberDropdown(false);

    const room = rooms.find(r => r.roomname === name);
    // Only request message history and members if the user is already a member of this room
    if (room?.isMember !== false) {
      getSocket().emit("get_message_of_room", { roomname: name, limit: 30 });
      getSocket().emit("get_room_members", { roomname: name });
    }
  }

  function loadOlderMessages() {
    if (!active || !nextCursor || loadingOlder) return;
    setLoadingOlder(true);
    getSocket().emit("get_message_of_room", {
      roomname: active.roomname,
      cursor: nextCursor,
      limit: 30,
    });
  }

  function createRoom() {
    if (!roomname.trim()) return;
    getSocket().emit("create_room", { roomname: roomname.trim(), description: description.trim() });
    setRoomname("");
    setDescription("");
  }

  function send(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim() || !active) return;
    const text = draft.trim();
    const otherMembers = roomMembers.filter(m => m.username !== user?.username);
    const isAllSelected = targetUsers.length > 0 && targetUsers.length === otherMembers.length;

    let mode = "all";
    let users = targetUsers;

    if (targetMode === "to") {
      if (isAllSelected || targetUsers.length === 0) {
        mode = "all";
        users = [];
      } else {
        mode = "to";
        users = targetUsers;
      }
    } else if (targetMode === "not_to") {
      if (isAllSelected) {
        mode = "not_to_all";
        users = [];
      } else if (targetUsers.length === 0) {
        mode = "all";
        users = [];
      } else {
        mode = "not_to";
        users = targetUsers;
      }
    }

    getSocket().emit("message_in_room", {
      text,
      roomname: active.roomname,
      target_mode: mode,
      target_users: users
    });
    setDraft("");
  }

  function emitTyping() {
    if (!active || Date.now() - lastTyping.current < 1500) return;
    lastTyping.current = Date.now();
    getSocket().emit("typing_in_room", { roomname: active.roomname });
  }

  function toggleTargetUser(username: string) {
    setTargetUsers(prev =>
      prev.includes(username) ? prev.filter(u => u !== username) : [...prev, username]
    );
  }

  function toggleAllMembers() {
    const otherMembers = roomMembers.filter(m => m.username !== user?.username);
    if (targetUsers.length === otherMembers.length) {
      setTargetUsers([]);
    } else {
      setTargetUsers(otherMembers.map(m => m.username));
    }
  }

  async function logout() {
    await signOut();
    disconnectSocket();
    navigate("/signin");
  }

  const activeRoomInfo = rooms.find(r => r.roomname === active?.roomname);
  const isMember = Boolean(activeRoomInfo?.isMember);
  const title = active ? `# ${active.roomname}` : "Select a room";

  const otherMembers = roomMembers.filter(m => m.username !== user?.username);
  const filteredMembers = otherMembers.filter(m =>
    m.username.toLowerCase().includes(memberSearch.toLowerCase())
  );

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100">
      <aside className="flex w-80 shrink-0 flex-col border-r border-slate-800 bg-slate-900">
        <header className="border-b border-slate-800 p-4">
          <div className="flex justify-between">
            <div>
              <h1 className="text-xl font-bold text-indigo-400">Ripple</h1>
              <p className="text-sm text-slate-400">@{user?.username}</p>
            </div>
            <button onClick={logout} className="text-xs text-slate-300 hover:text-white">
              Sign out
            </button>
          </div>
          <p className="mt-3 text-xs text-slate-400">
            <span className={connected ? "text-emerald-400" : "text-red-400"}>●</span>{" "}
            {connected ? "Connected" : "Connecting…"}
          </p>
        </header>

        <div className="border-b border-slate-800 p-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">Rooms</span>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          <input
            className="input mb-3 w-full"
            placeholder="Search rooms"
            value={roomFilter}
            onChange={e => setRoomFilter(e.target.value)}
          />
          <input
            className="input mb-2 w-full"
            placeholder="New room name"
            value={roomname}
            onChange={e => setRoomname(e.target.value)}
          />
          <input
            className="input mb-2 w-full"
            placeholder="Description (optional)"
            value={description}
            onChange={e => setDescription(e.target.value)}
          />
          <button onClick={createRoom} className="mb-4 w-full rounded bg-indigo-600 p-2 text-sm font-medium hover:bg-indigo-500 transition-colors">
            Create room
          </button>

          <div className="space-y-2">
            {rooms.map(room => (
              <div
                key={room.roomname}
                className={`rounded-xl border p-3 transition-colors ${
                  active?.roomname === room.roomname ? "border-indigo-500 bg-slate-800/60" : "border-slate-800 bg-slate-900/40 hover:border-slate-700"
                }`}
              >
                <button onClick={() => selectRoom(room.roomname)} className="w-full text-left">
                  <div className="flex items-center justify-between">
                    <b>#{room.roomname}</b>
                    {room.isMember && (
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400 border border-emerald-500/20">
                        Joined
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {room.members} {room.members === 1 ? "member" : "members"} · by {room.admin}
                  </p>
                </button>
                {!room.isMember && (
                  <button
                    onClick={() => getSocket().emit("join_room", { roomname: room.roomname })}
                    className="mt-2 w-full rounded bg-indigo-600/20 py-1 text-xs font-medium text-indigo-300 border border-indigo-500/30 hover:bg-indigo-600/30 transition-colors"
                  >
                    Join
                  </button>
                )}
              </div>
            ))}
            {rooms.length === 0 && (
              <p className="text-center text-xs text-slate-500 py-4">No rooms found</p>
            )}
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-800 p-5">
          <div>
            <h2 className="font-semibold">{title}</h2>
            {notice && <p className="text-xs text-emerald-300">{notice}</p>}
            {error && <p className="text-xs text-red-300">{error}</p>}
          </div>
          {active && isMember && (
            <button
              onClick={() => getSocket().emit("leave_room", { roomname: active.roomname })}
              className="rounded-lg border border-red-500/30 px-3 py-1 text-sm text-red-300 hover:bg-red-500/10 transition-colors"
            >
              Leave room
            </button>
          )}
          {active && !isMember && (
            <button
              onClick={() => getSocket().emit("join_room", { roomname: active.roomname })}
              className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
            >
              Join room
            </button>
          )}
        </header>

        <section ref={scrollContainer} className="flex-1 overflow-y-auto p-6">
          {active ? (
            isMember ? (
              <div className="mx-auto flex max-w-3xl flex-col gap-3">
                {hasMore && (
                  <div className="flex justify-center pb-2">
                    <button
                      onClick={loadOlderMessages}
                      disabled={loadingOlder}
                      className="rounded-full bg-slate-800 px-4 py-1.5 text-xs text-indigo-300 border border-slate-700 hover:bg-slate-700 disabled:opacity-50 transition-colors"
                    >
                      {loadingOlder ? "Loading earlier messages…" : "↑ Load earlier messages"}
                    </button>
                  </div>
                )}

                {messages.map((message, index) => {
                  const key = message.id ?? `${message.sent_at}-${message.sent_by}-${index}`;

                  if (message.type === "system") {
                    return (
                      <div key={key} className="flex justify-center my-2">
                        <span className="rounded-full bg-slate-800/80 px-3 py-1 text-xs text-slate-400 border border-slate-700/50">
                          {message.content} · <span className="text-slate-500">{time(message.sent_at)}</span>
                        </span>
                      </div>
                    );
                  }

                  const isMe = message.sent_by === user?.username;
                  const badge = getAudienceBadge(message, user?.username);

                  return (
                    <div
                      key={key}
                      className={isMe ? "text-right" : "text-left"}
                    >
                      <div
                        className={`inline-block max-w-[75%] rounded-2xl px-4 py-2 ${
                          isMe ? "bg-indigo-600" : "bg-slate-800"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          {!isMe && (
                            <b className="block text-xs text-indigo-200">{message.sent_by}</b>
                          )}
                          <div className="relative group inline-flex items-center">
                            <span
                              title={badge.tooltip}
                              className={`rounded px-1.5 py-0.5 text-[10px] border ${badge.style}`}
                            >
                              {badge.label}
                            </span>
                            {badge.tooltip && (
                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:flex flex-col items-center z-30 pointer-events-none">
                                <div className="whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-slate-100 shadow-xl border border-slate-700">
                                  {badge.tooltip}
                                </div>
                                <div className="w-1.5 h-1.5 bg-slate-900 border-r border-b border-slate-700 rotate-45 -mt-1"></div>
                              </div>
                            )}
                          </div>
                        </div>
                        <p className="break-words text-sm">{message.content}</p>
                        <small className="text-slate-300 text-xs">{time(message.sent_at)}</small>
                      </div>
                    </div>
                  );
                })}
                {typing && <p className="text-sm text-slate-400">{typing} is typing…</p>}
                <div ref={end} />
              </div>
            ) : (
              <div className="flex h-full items-center justify-center p-6 text-center">
                <div className="max-w-md rounded-2xl border border-slate-800 bg-slate-900/90 p-8 shadow-2xl">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600/20 text-2xl text-indigo-400 font-bold">
                    #
                  </div>
                  <h3 className="text-xl font-bold text-slate-100 mb-2">#{active.roomname}</h3>
                  {activeRoomInfo?.description && (
                    <p className="text-xs text-slate-400 mb-3">{activeRoomInfo.description}</p>
                  )}
                  <p className="text-sm text-slate-400 mb-6">
                    You need to join this group in order to view messages and chat with members.
                  </p>
                  <button
                    onClick={() => getSocket().emit("join_room", { roomname: active.roomname })}
                    className="w-full rounded-xl bg-indigo-600 py-3 font-semibold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 transition-all active:scale-[0.99]"
                  >
                    Join Group
                  </button>
                </div>
              </div>
            )
          ) : (
            <p className="grid h-full place-items-center text-slate-500">Pick a room to start chatting.</p>
          )}
        </section>

        {active && isMember && (
          <form onSubmit={send} className="border-t border-slate-800 bg-slate-900/60 p-4">
            <div className="mx-auto flex max-w-3xl flex-col gap-3">
              {/* Audience Targeting Controls (Two Input Boxes) */}
              <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-950/80 p-2.5 border border-slate-800 text-xs">
                {/* 1st Input Box: Mode (To vs Not To) */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="font-semibold text-slate-400">Audience:</span>
                  <select
                    value={targetMode}
                    onChange={e => setTargetMode(e.target.value as "to" | "not_to")}
                    className="rounded-lg bg-slate-900 px-2.5 py-1.5 font-medium text-indigo-300 border border-slate-700 focus:border-indigo-500 focus:outline-none cursor-pointer"
                  >
                    <option value="to">To (Selected members)</option>
                    <option value="not_to">Not to (Everyone except)</option>
                  </select>
                </div>

                {/* 2nd Input Box: Search & Member Selector with 'All' button */}
                <div className="relative flex flex-1 items-center gap-2 min-w-[240px]">
                  <input
                    type="text"
                    value={memberSearch}
                    onChange={e => {
                      setMemberSearch(e.target.value);
                      setShowMemberDropdown(true);
                    }}
                    onFocus={() => setShowMemberDropdown(true)}
                    placeholder="Search & select members…"
                    className="w-full rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 border border-slate-700 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                  />

                  <button
                    type="button"
                    onClick={toggleAllMembers}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold shrink-0 transition-colors border ${
                      targetUsers.length === otherMembers.length && otherMembers.length > 0
                        ? "bg-indigo-600 text-white border-indigo-500"
                        : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"
                    }`}
                  >
                    All
                  </button>

                  {targetUsers.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setTargetUsers([])}
                      className="rounded-lg px-2.5 py-1.5 text-xs font-semibold shrink-0 transition-colors border bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700 hover:text-slate-200"
                    >
                      Clear all
                    </button>
                  )}

                  {/* Dropdown for Member Selection */}
                  {showMemberDropdown && (
                    <div className="absolute bottom-full left-0 mb-2 w-full max-h-48 overflow-y-auto rounded-xl bg-slate-900 border border-slate-700 shadow-2xl p-2 z-20">
                      <div className="flex items-center justify-between pb-1 mb-1 border-b border-slate-800 px-1">
                        <span className="text-[11px] font-semibold text-slate-400">
                          {targetMode === "to" ? "Select recipients:" : "Select users to exclude:"}
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowMemberDropdown(false)}
                          className="text-[10px] text-slate-400 hover:text-slate-200"
                        >
                          ✕ Close
                        </button>
                      </div>
                      {filteredMembers.length === 0 ? (
                        <p className="p-2 text-center text-slate-500 text-[11px]">
                          {otherMembers.length === 0 ? "No other members in room" : "No members matching search"}
                        </p>
                      ) : (
                        <div className="space-y-1">
                          {filteredMembers.map(m => {
                            const selected = targetUsers.includes(m.username);
                            return (
                              <button
                                key={m.id}
                                type="button"
                                onClick={() => toggleTargetUser(m.username)}
                                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1 text-xs text-left transition-colors ${
                                  selected
                                    ? "bg-indigo-600/30 text-indigo-200 border border-indigo-500/40"
                                    : "hover:bg-slate-800 text-slate-300"
                                }`}
                              >
                                <span>@{m.username}</span>
                                <span className={`text-[10px] ${selected ? "text-indigo-400 font-bold" : "text-slate-600"}`}>
                                  {selected ? "✓ Selected" : "+ Add"}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Selected Pills Display (No text label) */}
              {targetUsers.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 px-1 text-xs">
                  {targetUsers.map(u => (
                    <span
                      key={u}
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] border font-medium ${
                        targetMode === "to"
                          ? "bg-indigo-500/10 text-indigo-300 border-indigo-500/30"
                          : "bg-rose-500/10 text-rose-300 border-rose-500/30"
                      }`}
                    >
                      @{u}
                      <button
                        type="button"
                        onClick={() => toggleTargetUser(u)}
                        className="hover:opacity-80 text-[10px] ml-0.5"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Message Draft Input & Send Button */}
              <div className="flex gap-3">
                <input
                  className="input flex-1"
                  value={draft}
                  onChange={e => {
                    setDraft(e.target.value);
                    emitTyping();
                  }}
                  placeholder={`Message #${active.roomname}`}
                />
                <button
                  disabled={!connected || !draft.trim()}
                  className="rounded-xl bg-indigo-600 px-6 font-medium disabled:opacity-50 hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-600/30"
                >
                  Send
                </button>
              </div>
            </div>
          </form>
        )}
        {active && !isMember && (
          <div className="border-t border-slate-800 bg-slate-900/50 p-4 text-center text-xs text-slate-500">
            🔒 You need to join this group in order to send messages.
          </div>
        )}
      </main>
    </div>
  );
}




