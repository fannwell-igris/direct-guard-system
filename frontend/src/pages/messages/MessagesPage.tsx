/**
 * MessagesPage.tsx
 *
 * Internal messaging / communication between staff users.
 *
 * NOTE (2026-09-19): The messages backend API has not yet been built.
 *   This page runs in a local-state demo mode (no HTTP calls are made).
 *   When GET/POST /api/messages is implemented, replace the demo state
 *   initializer and the `sendMessage` handler with real fetch calls and
 *   remove the DEMO_* constants.
 *
 * Layout: two-pane — left rail = conversations list, right = thread view.
 * On narrow screens the rail is shown until a thread is opened, then the
 * thread fills the viewport (back button returns to the rail).
 */

import { useState, useRef, useEffect } from "react";
import type { FormEvent } from "react";
import {
  MessageSquare, Send, Search, Plus, X, ChevronLeft,
  Circle, CheckCheck,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { cn } from "../../lib/utils";
import api from "../../api/client";

// ─── types ───────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  threadId: string;
  senderId: string;
  senderName: string;
  body: string;
  sentAt: string; // ISO
  readBy: string[]; // list of userIds who have read it
}

interface Thread {
  id: string;
  participantIds: string[];
  participantNames: string[];
  subject: string;
  lastMessage: string;
  lastMessageAt: string;
  unread: number;
}

// ─── demo seed data ──────────────────────────────────────────────────────────

const ME_ID = "current-user";
const ME_NAME = "You";

const DEMO_THREADS: Thread[] = [
  {
    id: "t1",
    participantIds: [ME_ID, "u2"],
    participantNames: ["Benjamin Mwila"],
    subject: "Site coverage — Levy Mall",
    lastMessage: "Guard #3 is confirmed for tomorrow's morning shift.",
    lastMessageAt: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
    unread: 2,
  },
  {
    id: "t2",
    participantIds: [ME_ID, "u3"],
    participantNames: ["Grace Phiri"],
    subject: "Invoice INV-0042 payment",
    lastMessage: "The client confirmed payment was sent via EFT.",
    lastMessageAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    unread: 0,
  },
  {
    id: "t3",
    participantIds: [ME_ID, "u4", "u5"],
    participantNames: ["James Banda", "Sandra Tembo"],
    subject: "Roster — weekend shift cover",
    lastMessage: "Can someone cover the Sunday night shift at Arcades?",
    lastMessageAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    unread: 0,
  },
];

const DEMO_MESSAGES: Record<string, Message[]> = {
  t1: [
    {
      id: "m1", threadId: "t1", senderId: "u2", senderName: "Benjamin Mwila",
      body: "Hi, just checking in on the Levy Mall roster for tomorrow.",
      sentAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(), readBy: [ME_ID],
    },
    {
      id: "m2", threadId: "t1", senderId: ME_ID, senderName: ME_NAME,
      body: "We have 3 guards confirmed. Checking on the 4th now.",
      sentAt: new Date(Date.now() - 1000 * 60 * 20).toISOString(), readBy: [ME_ID, "u2"],
    },
    {
      id: "m3", threadId: "t1", senderId: "u2", senderName: "Benjamin Mwila",
      body: "Thanks. Let me know if you need a replacement.",
      sentAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(), readBy: [],
    },
    {
      id: "m4", threadId: "t1", senderId: "u2", senderName: "Benjamin Mwila",
      body: "Guard #3 is confirmed for tomorrow's morning shift.",
      sentAt: new Date(Date.now() - 1000 * 60 * 8).toISOString(), readBy: [],
    },
  ],
  t2: [
    {
      id: "m5", threadId: "t2", senderId: "u3", senderName: "Grace Phiri",
      body: "Following up on invoice INV-0042 for Shoprite Longacres.",
      sentAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(), readBy: [ME_ID],
    },
    {
      id: "m6", threadId: "t2", senderId: ME_ID, senderName: ME_NAME,
      body: "It was sent to the client on Monday. Awaiting confirmation.",
      sentAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(), readBy: [ME_ID, "u3"],
    },
    {
      id: "m7", threadId: "t2", senderId: "u3", senderName: "Grace Phiri",
      body: "The client confirmed payment was sent via EFT.",
      sentAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), readBy: [ME_ID],
    },
  ],
  t3: [
    {
      id: "m8", threadId: "t3", senderId: "u4", senderName: "James Banda",
      body: "Good morning team. We have a gap on the Sunday night shift at Arcades.",
      sentAt: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(), readBy: [ME_ID],
    },
    {
      id: "m9", threadId: "t3", senderId: "u5", senderName: "Sandra Tembo",
      body: "Can someone cover the Sunday night shift at Arcades?",
      sentAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), readBy: [ME_ID],
    },
  ],
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function timeAgo(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(isoStr).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function threadParticipants(thread: Thread): string {
  return thread.participantNames.join(", ");
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const AVATAR_COLORS = [
  "bg-blue-500", "bg-purple-500", "bg-orange-500",
  "bg-pink-500", "bg-teal-500", "bg-indigo-500",
];

function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[h];
}

// ─── sub-components ───────────────────────────────────────────────────────────

function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const dims = size === "sm" ? "w-7 h-7 text-xs" : size === "lg" ? "w-10 h-10 text-sm" : "w-8 h-8 text-xs";
  return (
    <div className={cn("rounded-full flex items-center justify-center font-semibold text-white flex-shrink-0", dims, avatarColor(name))}>
      {initials(name)}
    </div>
  );
}

// ─── user type returned by GET /api/messages/users ──────────────────────────

interface SystemUser {
  id: string;
  fullName: string;
  email: string;
  role: string;
}

interface NewThreadModalProps {
  onClose: () => void;
  onCreate: (subject: string, participantName: string, participantId: string, body: string) => void;
}

function NewThreadModal({ onClose, onCreate }: NewThreadModalProps) {
  const [subject, setSubject]           = useState("");
  const [query, setQuery]               = useState("");           // what user types
  const [selectedUser, setSelectedUser] = useState<SystemUser | null>(null);
  const [suggestions, setSuggestions]   = useState<SystemUser[]>([]);
  const [allUsers, setAllUsers]         = useState<SystemUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [showDropdown, setShowDropdown] = useState(false);
  const [body, setBody]                 = useState("");
  const toRef = useRef<HTMLDivElement>(null);

  // Fetch all users once on mount
  useEffect(() => {
    api.get("/messages/users")
      .then((res) => setAllUsers(res.data.data ?? res.data ?? []))
      .catch(() => setAllUsers([]))
      .finally(() => setLoadingUsers(false));
  }, []);

  // Filter as user types
  useEffect(() => {
    if (!query.trim() || selectedUser) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }
    const q = query.toLowerCase();
    const matches = allUsers.filter(
      (u) => u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    ).slice(0, 8);
    setSuggestions(matches);
    setShowDropdown(matches.length > 0);
  }, [query, allUsers, selectedUser]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (toRef.current && !toRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function selectUser(u: SystemUser) {
    setSelectedUser(u);
    setQuery(u.fullName);
    setShowDropdown(false);
  }

  function clearUser() {
    setSelectedUser(null);
    setQuery("");
    setSuggestions([]);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !selectedUser || !body.trim()) return;
    onCreate(subject.trim(), selectedUser.fullName, selectedUser.id, body.trim());
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">New Message</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">

          {/* ── To field with autocomplete ── */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">To</label>
            <div ref={toRef} className="relative">
              <div className={cn(
                "input flex items-center gap-2 p-0 overflow-hidden",
                selectedUser ? "pr-2" : ""
              )}>
                {selectedUser ? (
                  /* Selected chip */
                  <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-md px-2.5 py-1 m-1.5 text-sm">
                    <span className="font-medium text-emerald-800">{selectedUser.fullName}</span>
                    <span className="text-emerald-500 text-xs">{selectedUser.role}</span>
                    <button
                      type="button"
                      onClick={clearUser}
                      className="text-emerald-400 hover:text-emerald-700 ml-1"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <input
                    type="text"
                    placeholder={loadingUsers ? "Loading users…" : "Search by name or email…"}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => query.trim() && setShowDropdown(suggestions.length > 0)}
                    className="flex-1 px-3 py-2 bg-transparent outline-none text-sm placeholder:text-gray-400"
                    autoComplete="off"
                    disabled={loadingUsers}
                  />
                )}
              </div>

              {/* Dropdown */}
              {showDropdown && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                  {suggestions.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); selectUser(u); }}
                      className="w-full text-left px-4 py-2.5 hover:bg-emerald-50 transition-colors flex items-center gap-3"
                    >
                      <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center text-xs font-bold text-emerald-700 flex-shrink-0">
                        {u.fullName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{u.fullName}</p>
                        <p className="text-xs text-gray-400 truncate">{u.email} · {u.role}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {!selectedUser && query.trim() && suggestions.length === 0 && !loadingUsers && (
              <p className="text-xs text-gray-400 mt-1">No users found matching "{query}"</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Subject</label>
            <input
              type="text"
              placeholder="What's this about?"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="input"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Message</label>
            <textarea
              placeholder="Write your message…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              className="input resize-none"
              required
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button
              type="submit"
              disabled={!selectedUser || !subject.trim() || !body.trim()}
              className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Send size={14} /> Send Message
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function MessagesPage() {
  const { user } = useAuth();

  const [threads, setThreads] = useState<Thread[]>(DEMO_THREADS);
  const [messages, setMessages] = useState<Record<string, Message[]>>(DEMO_MESSAGES);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [showNewThread, setShowNewThread] = useState(false);
  const [sending, setSending] = useState(false);

  // Mobile: show thread list or thread view
  const [mobileView, setMobileView] = useState<"list" | "thread">("list");

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectedThread = threads.find((t) => t.id === selectedThreadId) ?? null;
  const threadMessages = selectedThreadId ? (messages[selectedThreadId] ?? []) : [];

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [threadMessages.length]);

  // Mark thread as read when opened
  function openThread(threadId: string) {
    setSelectedThreadId(threadId);
    setMobileView("thread");
    setDraftBody("");
    setThreads((prev) =>
      prev.map((t) => (t.id === threadId ? { ...t, unread: 0 } : t))
    );
  }

  function sendMessage(e: FormEvent) {
    e.preventDefault();
    if (!draftBody.trim() || !selectedThreadId) return;
    setSending(true);

    const newMsg: Message = {
      id: `m-${Date.now()}`,
      threadId: selectedThreadId,
      senderId: ME_ID,
      senderName: user?.email ?? ME_NAME,
      body: draftBody.trim(),
      sentAt: new Date().toISOString(),
      readBy: [ME_ID],
    };

    setMessages((prev) => ({
      ...prev,
      [selectedThreadId]: [...(prev[selectedThreadId] ?? []), newMsg],
    }));

    setThreads((prev) =>
      prev.map((t) =>
        t.id === selectedThreadId
          ? { ...t, lastMessage: newMsg.body, lastMessageAt: newMsg.sentAt }
          : t
      )
    );

    setDraftBody("");
    setSending(false);
  }

  function createThread(subject: string, participantName: string, participantId: string, body: string) {
    const newThreadId = `t-${Date.now()}`;
    const newThread: Thread = {
      id: newThreadId,
      participantIds: [ME_ID, participantId],
      participantNames: [participantName],
      subject,
      lastMessage: body,
      lastMessageAt: new Date().toISOString(),
      unread: 0,
    };
    const newMsg: Message = {
      id: `m-${Date.now()}`,
      threadId: newThreadId,
      senderId: ME_ID,
      senderName: user?.email ?? ME_NAME,
      body,
      sentAt: new Date().toISOString(),
      readBy: [ME_ID],
    };
    setThreads((prev) => [newThread, ...prev]);
    setMessages((prev) => ({ ...prev, [newThreadId]: [newMsg] }));
    setShowNewThread(false);
    openThread(newThreadId);
  }

  const filteredThreads = search.trim()
    ? threads.filter(
        (t) =>
          t.subject.toLowerCase().includes(search.toLowerCase()) ||
          t.participantNames.some((n) => n.toLowerCase().includes(search.toLowerCase()))
      )
    : threads;

  const totalUnread = threads.reduce((s, t) => s + t.unread, 0);

  return (
    <>
      {showNewThread && (
        <NewThreadModal onClose={() => setShowNewThread(false)} onCreate={createThread as any} />
      )}

      <div className="flex h-full gap-0 overflow-hidden rounded-xl border border-gray-200 shadow-sm bg-white">
        {/* ── Left rail: conversation list ────────────────────────────── */}
        <div
          className={cn(
            "flex flex-col w-72 flex-shrink-0 border-r border-gray-100",
            // Mobile: hide rail when viewing a thread
            mobileView === "thread" ? "hidden md:flex" : "flex"
          )}
        >
          {/* Rail header */}
          <div className="px-4 pt-4 pb-3 border-b border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <h1 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <MessageSquare size={16} className="text-magen-green" />
                Messages
                {totalUnread > 0 && (
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-magen-green text-white text-xs font-bold">
                    {totalUnread}
                  </span>
                )}
              </h1>
              <button
                onClick={() => setShowNewThread(true)}
                className="btn-primary py-1.5 px-2.5 text-xs"
                title="New conversation"
              >
                <Plus size={13} />
                New
              </button>
            </div>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search conversations…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input pl-7 py-1.5 text-xs"
              />
            </div>
          </div>

          {/* Thread list */}
          <div className="flex-1 overflow-y-auto">
            {filteredThreads.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center text-gray-400">
                <MessageSquare size={28} className="mb-2 opacity-30" />
                <p className="text-sm">No conversations found</p>
              </div>
            ) : (
              filteredThreads.map((thread) => {
                const isSelected = thread.id === selectedThreadId;
                const others = thread.participantNames[0] ?? "Unknown";
                return (
                  <button
                    key={thread.id}
                    onClick={() => openThread(thread.id)}
                    className={cn(
                      "w-full text-left px-4 py-3 border-b border-gray-50 transition-colors flex items-start gap-3",
                      isSelected ? "bg-magen-green-light" : "hover:bg-gray-50"
                    )}
                  >
                    <Avatar name={others} size="md" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-1 mb-0.5">
                        <span className={cn("text-sm truncate", thread.unread > 0 ? "font-semibold text-gray-900" : "font-medium text-gray-700")}>
                          {threadParticipants(thread)}
                        </span>
                        <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">
                          {timeAgo(thread.lastMessageAt)}
                        </span>
                      </div>
                      <p className={cn("text-xs truncate", thread.unread > 0 ? "font-medium text-magen-navy" : "text-gray-500")}>
                        {thread.subject}
                      </p>
                      <div className="flex items-center justify-between mt-0.5">
                        <p className="text-xs text-gray-400 truncate">{thread.lastMessage}</p>
                        {thread.unread > 0 && (
                          <span className="ml-2 inline-flex items-center justify-center w-4 h-4 rounded-full bg-magen-green text-white text-xs font-bold flex-shrink-0">
                            {thread.unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ── Right pane: thread view ────────────────────────────────── */}
        <div
          className={cn(
            "flex flex-col flex-1 min-w-0",
            mobileView === "list" ? "hidden md:flex" : "flex"
          )}
        >
          {selectedThread ? (
            <>
              {/* Thread header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
                {/* Mobile back button */}
                <button
                  onClick={() => { setMobileView("list"); setSelectedThreadId(null); }}
                  className="md:hidden p-1 rounded text-gray-500 hover:bg-gray-100"
                >
                  <ChevronLeft size={18} />
                </button>
                <Avatar name={selectedThread.participantNames[0] ?? "?"} size="lg" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm truncate">
                    {threadParticipants(selectedThread)}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{selectedThread.subject}</p>
                </div>
                <div className="flex items-center gap-1 text-xs text-gray-400">
                  <Circle size={6} className="fill-green-500 text-green-500" />
                  Online
                </div>
              </div>

              {/* Messages list */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                {threadMessages.map((msg) => {
                  const isMe = msg.senderId === ME_ID;
                  return (
                    <div key={msg.id} className={cn("flex items-end gap-2", isMe ? "flex-row-reverse" : "flex-row")}>
                      {!isMe && <Avatar name={msg.senderName} size="sm" />}
                      <div className={cn("max-w-[70%]")}>
                        {!isMe && (
                          <p className="text-xs text-gray-500 mb-1 ml-1">{msg.senderName}</p>
                        )}
                        <div
                          className={cn(
                            "px-3 py-2 rounded-2xl text-sm leading-relaxed",
                            isMe
                              ? "bg-magen-navy text-white rounded-br-sm"
                              : "bg-gray-100 text-gray-800 rounded-bl-sm"
                          )}
                        >
                          {msg.body}
                        </div>
                        <div className={cn("flex items-center gap-1 mt-1", isMe ? "justify-end" : "justify-start")}>
                          <span className="text-xs text-gray-400">{timeAgo(msg.sentAt)}</span>
                          {isMe && (
                            <CheckCheck
                              size={12}
                              className={msg.readBy.length > 1 ? "text-magen-green" : "text-gray-300"}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Compose box */}
              <div className="px-4 py-3 border-t border-gray-100">
                <form onSubmit={sendMessage} className="flex items-end gap-2">
                  <textarea
                    placeholder="Write a message…"
                    value={draftBody}
                    onChange={(e) => setDraftBody(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage(e as any);
                      }
                    }}
                    rows={1}
                    className="input flex-1 resize-none min-h-[40px] max-h-[120px] overflow-y-auto py-2.5"
                    style={{ height: "auto" }}
                  />
                  <button
                    type="submit"
                    disabled={!draftBody.trim() || sending}
                    className="btn-primary py-2.5 px-3"
                  >
                    <Send size={15} />
                  </button>
                </form>
                <p className="text-xs text-gray-400 mt-1">Press Enter to send, Shift+Enter for new line</p>
              </div>
            </>
          ) : (
            /* Empty state */
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-gray-400">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
                <MessageSquare size={28} className="text-gray-300" />
              </div>
              <h3 className="text-base font-semibold text-gray-700 mb-1">Select a conversation</h3>
              <p className="text-sm max-w-xs">
                Choose a conversation from the left, or start a new one to message a colleague.
              </p>
              <button
                onClick={() => setShowNewThread(true)}
                className="btn-primary mt-4"
              >
                <Plus size={15} />
                New Conversation
              </button>
              <p className="text-xs text-gray-300 mt-6">
                Messages API coming soon — currently showing demo data.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
