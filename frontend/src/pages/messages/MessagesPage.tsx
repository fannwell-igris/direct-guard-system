/**
 * MessagesPage.tsx
 *
 * Internal messaging / communication between staff users.
 * Layout: two-pane — left rail = conversations list, right = thread view.
 * On narrow screens the rail is shown until a thread is opened, then the
 * thread fills the viewport (back button returns to the rail).
 */

import { useState, useRef, useEffect, useCallback } from "react";
import type { FormEvent } from "react";
import {
  MessageSquare, Send, Search, Plus, X, ChevronLeft,
  Circle, CheckCheck, Loader2,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { cn } from "../../lib/utils";
import api from "../../api/client";

// ─── types ───────────────────────────────────────────────────────────────────

interface Participant {
  id:       string;
  fullName: string;
  email:    string;
  role:     string;
}

interface ApiMessage {
  id:       string;
  threadId: string;
  senderId: string;
  body:     string;
  sentAt:   string;
  readBy:   string[];
  sender:   { id: string; fullName: string; role: string };
}

interface Thread {
  id:            string;
  subject:       string;
  participants:  Participant[];        // other participants (not me)
  lastMessage:   string;
  lastMessageAt: string;
  unread:        number;
}

interface SystemUser {
  id:       string;
  fullName: string;
  email:    string;
  role:     string;
}

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

function initials(name: string): string {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
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

function unwrapList<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  const r = raw as Record<string, unknown>;
  if (Array.isArray(r?.data))  return r.data  as T[];
  if (Array.isArray(r?.users)) return r.users as T[];
  return [];
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

// ─── New Thread Modal ─────────────────────────────────────────────────────────

interface NewThreadModalProps {
  onClose:  () => void;
  onCreate: (subject: string, recipientId: string, recipientName: string, body: string) => Promise<void>;
}

function NewThreadModal({ onClose, onCreate }: NewThreadModalProps) {
  const [subject, setSubject]           = useState("");
  const [query, setQuery]               = useState("");
  const [selectedUser, setSelectedUser] = useState<SystemUser | null>(null);
  const [suggestions, setSuggestions]   = useState<SystemUser[]>([]);
  const [allUsers, setAllUsers]         = useState<SystemUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [showDropdown, setShowDropdown] = useState(false);
  const [body, setBody]                 = useState("");
  const [submitting, setSubmitting]     = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const toRef = useRef<HTMLDivElement>(null);

  // Fetch all users once on mount
  useEffect(() => {
    api.get("/messages/users")
      .then((res) => {
        setAllUsers(unwrapList<SystemUser>(res.data));
      })
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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedUser || !subject.trim() || !body.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await onCreate(subject.trim(), selectedUser.id, selectedUser.fullName, body.trim());
    } catch {
      setError("Failed to send. Please try again.");
      setSubmitting(false);
    }
  }

  const canSend = !!selectedUser && subject.trim().length > 0 && body.trim().length > 0 && !submitting;

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
              <div className={cn("input flex items-center gap-2 p-0 overflow-hidden", selectedUser ? "pr-2" : "")}>
                {selectedUser ? (
                  <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-md px-2.5 py-1 m-1.5 text-sm">
                    <span className="font-medium text-emerald-800">{selectedUser.fullName}</span>
                    <span className="text-emerald-500 text-xs">{selectedUser.role}</span>
                    <button type="button" onClick={clearUser} className="text-emerald-400 hover:text-emerald-700 ml-1">
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
            {!selectedUser && query.trim() === "" && !loadingUsers && allUsers.length === 0 && (
              <p className="text-xs text-red-400 mt-1">Could not load users — please try again.</p>
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

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button
              type="submit"
              disabled={!canSend}
              className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {submitting ? "Sending…" : "Send Message"}
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
  const myId = user?.id ?? "";

  const [threads, setThreads]               = useState<Thread[]>([]);
  const [threadMessages, setThreadMessages] = useState<ApiMessage[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [search, setSearch]                 = useState("");
  const [draftBody, setDraftBody]           = useState("");
  const [showNewThread, setShowNewThread]   = useState(false);
  const [sending, setSending]               = useState(false);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMsgs, setLoadingMsgs]       = useState(false);

  // Mobile: show thread list or thread view
  const [mobileView, setMobileView] = useState<"list" | "thread">("list");

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectedThread = threads.find((t) => t.id === selectedThreadId) ?? null;

  // ── fetch thread list ──────────────────────────────────────────────────────
  const fetchThreads = useCallback(async () => {
    try {
      const res = await api.get("/messages/threads");
      setThreads(unwrapList<Thread>(res.data));
    } catch {
      setThreads([]);
    } finally {
      setLoadingThreads(false);
    }
  }, []);

  useEffect(() => { fetchThreads(); }, [fetchThreads]);

  // ── fetch messages when thread selected ───────────────────────────────────
  useEffect(() => {
    if (!selectedThreadId) { setThreadMessages([]); return; }
    setLoadingMsgs(true);
    api.get(`/messages/threads/${selectedThreadId}/messages`)
      .then((res) => {
        setThreadMessages(unwrapList<ApiMessage>(res.data));
        // mark as read locally
        setThreads((prev) =>
          prev.map((t) => t.id === selectedThreadId ? { ...t, unread: 0 } : t)
        );
      })
      .catch(() => setThreadMessages([]))
      .finally(() => setLoadingMsgs(false));
  }, [selectedThreadId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [threadMessages.length]);

  function openThread(threadId: string) {
    setSelectedThreadId(threadId);
    setMobileView("thread");
    setDraftBody("");
  }

  async function sendMessage(e: FormEvent) {
    e.preventDefault();
    if (!draftBody.trim() || !selectedThreadId || sending) return;
    setSending(true);
    try {
      const res = await api.post(`/messages/threads/${selectedThreadId}/messages`, { body: draftBody.trim() });
      const newMsg: ApiMessage = res.data?.data ?? res.data;
      setThreadMessages((prev) => [...prev, newMsg]);
      setThreads((prev) =>
        prev.map((t) =>
          t.id === selectedThreadId
            ? { ...t, lastMessage: draftBody.trim(), lastMessageAt: new Date().toISOString() }
            : t
        )
      );
      setDraftBody("");
    } catch {
      // keep the draft so the user can retry
    } finally {
      setSending(false);
    }
  }

  async function createThread(subject: string, recipientId: string, recipientName: string, body: string) {
    const res = await api.post("/messages/threads", { recipientId, subject, body });
    const created = res.data?.data ?? res.data;
    // Add the new thread to the top of the list
    const newThread: Thread = {
      id:            created.id,
      subject:       created.subject,
      participants:  created.participants
        ?.filter((p: { user: Participant }) => p.user?.id !== myId)
        .map((p: { user: Participant }) => p.user) ?? [{ id: recipientId, fullName: recipientName, email: "", role: "" }],
      lastMessage:   body,
      lastMessageAt: new Date().toISOString(),
      unread:        0,
    };
    setThreads((prev) => [newThread, ...prev]);
    setShowNewThread(false);
    openThread(created.id);
  }

  const filteredThreads = search.trim()
    ? threads.filter(
        (t) =>
          t.subject.toLowerCase().includes(search.toLowerCase()) ||
          t.participants.some((p) => p.fullName.toLowerCase().includes(search.toLowerCase()))
      )
    : threads;

  const totalUnread = threads.reduce((s, t) => s + t.unread, 0);

  return (
    <>
      {showNewThread && (
        <NewThreadModal onClose={() => setShowNewThread(false)} onCreate={createThread} />
      )}

      <div className="flex h-full gap-0 overflow-hidden rounded-xl border border-gray-200 shadow-sm bg-white">
        {/* ── Left rail: conversation list ────────────────────────────── */}
        <div
          className={cn(
            "flex flex-col w-72 flex-shrink-0 border-r border-gray-100",
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
            {loadingThreads ? (
              <div className="flex items-center justify-center py-16 text-gray-400">
                <Loader2 size={22} className="animate-spin" />
              </div>
            ) : filteredThreads.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center text-gray-400">
                <MessageSquare size={28} className="mb-2 opacity-30" />
                <p className="text-sm">
                  {search.trim() ? "No conversations found" : "No messages yet"}
                </p>
                {!search.trim() && (
                  <button onClick={() => setShowNewThread(true)} className="btn-primary mt-3 text-xs">
                    <Plus size={12} /> Start a conversation
                  </button>
                )}
              </div>
            ) : (
              filteredThreads.map((thread) => {
                const isSelected = thread.id === selectedThreadId;
                const otherName = thread.participants[0]?.fullName ?? "Unknown";
                return (
                  <button
                    key={thread.id}
                    onClick={() => openThread(thread.id)}
                    className={cn(
                      "w-full text-left px-4 py-3 border-b border-gray-50 transition-colors flex items-start gap-3",
                      isSelected ? "bg-magen-green-light" : "hover:bg-gray-50"
                    )}
                  >
                    <Avatar name={otherName} size="md" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-1 mb-0.5">
                        <span className={cn("text-sm truncate", thread.unread > 0 ? "font-semibold text-gray-900" : "font-medium text-gray-700")}>
                          {thread.participants.map((p) => p.fullName).join(", ") || "Unknown"}
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
                <button
                  onClick={() => { setMobileView("list"); setSelectedThreadId(null); }}
                  className="md:hidden p-1 rounded text-gray-500 hover:bg-gray-100"
                >
                  <ChevronLeft size={18} />
                </button>
                <Avatar name={selectedThread.participants[0]?.fullName ?? "?"} size="lg" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm truncate">
                    {selectedThread.participants.map((p) => p.fullName).join(", ") || "Unknown"}
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
                {loadingMsgs ? (
                  <div className="flex items-center justify-center py-12 text-gray-400">
                    <Loader2 size={22} className="animate-spin" />
                  </div>
                ) : threadMessages.length === 0 ? (
                  <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
                    No messages yet — send the first one!
                  </div>
                ) : (
                  threadMessages.map((msg) => {
                    const isMe = msg.senderId === myId;
                    const senderName = isMe ? user?.fullName ?? "You" : msg.sender?.fullName ?? "Unknown";
                    return (
                      <div key={msg.id} className={cn("flex items-end gap-2", isMe ? "flex-row-reverse" : "flex-row")}>
                        {!isMe && <Avatar name={senderName} size="sm" />}
                        <div className="max-w-[70%]">
                          {!isMe && (
                            <p className="text-xs text-gray-500 mb-1 ml-1">{senderName}</p>
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
                  })
                )}
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
                        sendMessage(e as unknown as FormEvent);
                      }
                    }}
                    rows={1}
                    className="input flex-1 resize-none min-h-[40px] max-h-[120px] overflow-y-auto py-2.5"
                    style={{ height: "auto" }}
                  />
                  <button
                    type="submit"
                    disabled={!draftBody.trim() || sending}
                    className="btn-primary py-2.5 px-3 disabled:opacity-40"
                  >
                    {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
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
            </div>
          )}
        </div>
      </div>
    </>
  );
}
