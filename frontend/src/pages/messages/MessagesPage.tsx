/**
 * MessagesPage.tsx
 *
 * Internal messaging / communication between staff users.
 * Wired to the real /api/messages backend (GET/POST threads + messages).
 *
 * Layout: two-pane — left rail = conversations list, right = thread view.
 * On narrow screens the rail is shown until a thread is opened, then the
 * thread fills the viewport (back button returns to the rail).
 */

import { useState, useRef, useEffect, useCallback } from "react";
import type { FormEvent } from "react";
import {
  MessageSquare, Send, Search, Plus, X, ChevronLeft,
  CheckCheck, Loader2,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { cn } from "../../lib/utils";
import api from "../../api/client";

// ─── types ───────────────────────────────────────────────────────────────────

interface ApiMessage {
  id: string;
  threadId: string;
  senderId: string;
  senderName: string;
  body: string;
  sentAt: string; // ISO
  readBy: string[]; // list of userIds who have read it
}

interface ApiThread {
  id: string;
  subject: string;
  participantNames: string[];
  lastMessage: string | null;
  lastMessageAt: string;
  unread: number;
}

interface ApiUser {
  id: string;
  fullName: string;
  email: string;
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

interface NewThreadModalProps {
  onClose: () => void;
  onCreate: (subject: string, participantIds: string[], body: string) => Promise<void>;
}

function NewThreadModal({ onClose, onCreate }: NewThreadModalProps) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [selectedUsers, setSelectedUsers] = useState<ApiUser[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ data: ApiUser[] }>("/messages/users")
      .then((res) => setUsers(res.data.data ?? []))
      .catch(() => setUsers([]))
      .finally(() => setLoadingUsers(false));
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const filteredUsers = users.filter(
    (u) =>
      !selectedUsers.find((s) => s.id === u.id) &&
      (u.fullName.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.email.toLowerCase().includes(userSearch.toLowerCase()))
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!subject.trim() || selectedUsers.length === 0 || !body.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await onCreate(subject.trim(), selectedUsers.map((u) => u.id), body.trim());
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Failed to create conversation.");
      setSubmitting(false);
    }
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
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>
          )}

          {/* Recipient picker */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">To</label>
            {selectedUsers.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {selectedUsers.map((u) => (
                  <span key={u.id} className="inline-flex items-center gap-1 text-xs bg-magen-green-light text-magen-navy px-2 py-0.5 rounded-full">
                    {u.fullName}
                    <button type="button" onClick={() => setSelectedUsers((p) => p.filter((s) => s.id !== u.id))}>
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <input
              type="text"
              placeholder={loadingUsers ? "Loading users…" : "Search by name or email…"}
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              className="input"
              disabled={loadingUsers}
            />
            {userSearch.trim() && filteredUsers.length > 0 && (
              <div className="border border-gray-200 rounded-lg mt-1 max-h-36 overflow-y-auto shadow-sm">
                {filteredUsers.slice(0, 8).map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => { setSelectedUsers((p) => [...p, u]); setUserSearch(""); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                  >
                    <Avatar name={u.fullName} size="sm" />
                    <div>
                      <div className="text-gray-800 font-medium">{u.fullName}</div>
                      <div className="text-xs text-gray-400">{u.email}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {userSearch.trim() && filteredUsers.length === 0 && !loadingUsers && (
              <p className="text-xs text-gray-400 mt-1">No users found.</p>
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
              disabled={submitting || selectedUsers.length === 0 || !subject.trim() || !body.trim()}
              className="btn-primary"
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Send Message
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

  const [threads, setThreads] = useState<ApiThread[]>([]);
  const [messages, setMessages] = useState<Record<string, ApiMessage[]>>({});
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [showNewThread, setShowNewThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Mobile: show thread list or thread view
  const [mobileView, setMobileView] = useState<"list" | "thread">("list");

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectedThread = threads.find((t) => t.id === selectedThreadId) ?? null;
  const threadMessages = selectedThreadId ? (messages[selectedThreadId] ?? []) : [];

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [threadMessages.length]);

  // Load thread list on mount
  const loadThreads = useCallback(async () => {
    try {
      const res = await api.get<{ data: ApiThread[] }>("/messages/threads");
      setThreads(res.data.data ?? []);
    } catch {
      // silent — will show empty state
    } finally {
      setLoadingThreads(false);
    }
  }, []);

  useEffect(() => { loadThreads(); }, [loadThreads]);

  // Load messages when a thread is opened
  async function openThread(threadId: string) {
    setSelectedThreadId(threadId);
    setMobileView("thread");
    setDraftBody("");

    // Mark as read locally immediately
    setThreads((prev) => prev.map((t) => (t.id === threadId ? { ...t, unread: 0 } : t)));

    // Only fetch if we don't already have messages for this thread
    if (!messages[threadId]) {
      setLoadingMessages(true);
      try {
        const res = await api.get<{ data: ApiMessage[] }>(`/messages/threads/${threadId}/messages`);
        setMessages((prev) => ({ ...prev, [threadId]: res.data.data ?? [] }));
      } catch {
        setMessages((prev) => ({ ...prev, [threadId]: [] }));
      } finally {
        setLoadingMessages(false);
      }
    }
  }

  async function sendMessage(e: FormEvent) {
    e.preventDefault();
    if (!draftBody.trim() || !selectedThreadId || sending) return;
    setSending(true);

    const body = draftBody.trim();
    setDraftBody("");

    try {
      const res = await api.post<{ data: ApiMessage }>(`/messages/threads/${selectedThreadId}/messages`, { body });
      const newMsg = res.data.data;
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
    } catch {
      // Restore draft if send failed
      setDraftBody(body);
    } finally {
      setSending(false);
    }
  }

  async function createThread(subject: string, participantIds: string[], body: string) {
    const res = await api.post<{ data: { thread: ApiThread; message: ApiMessage } }>("/messages/threads", {
      subject,
      participantIds,
      body,
    });
    const { thread, message } = res.data.data;
    setThreads((prev) => [thread, ...prev]);
    setMessages((prev) => ({ ...prev, [thread.id]: [message] }));
    setShowNewThread(false);
    openThread(thread.id);
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
              <div className="flex items-center justify-center py-16">
                <Loader2 size={20} className="animate-spin text-gray-300" />
              </div>
            ) : filteredThreads.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center text-gray-400">
                <MessageSquare size={28} className="mb-2 opacity-30" />
                <p className="text-sm">{search.trim() ? "No conversations found" : "No messages yet"}</p>
                {!search.trim() && (
                  <button onClick={() => setShowNewThread(true)} className="text-xs text-magen-green mt-2 hover:underline">
                    Start a conversation
                  </button>
                )}
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
                          {thread.participantNames.join(", ")}
                        </span>
                        <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">
                          {timeAgo(thread.lastMessageAt)}
                        </span>
                      </div>
                      <p className={cn("text-xs truncate", thread.unread > 0 ? "font-medium text-magen-navy" : "text-gray-500")}>
                        {thread.subject}
                      </p>
                      <div className="flex items-center justify-between mt-0.5">
                        <p className="text-xs text-gray-400 truncate">{thread.lastMessage ?? ""}</p>
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
                <Avatar name={selectedThread.participantNames[0] ?? "?"} size="lg" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm truncate">
                    {selectedThread.participantNames.join(", ")}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{selectedThread.subject}</p>
                </div>
              </div>

              {/* Messages list */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                {loadingMessages ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 size={20} className="animate-spin text-gray-300" />
                  </div>
                ) : threadMessages.length === 0 ? (
                  <div className="flex items-center justify-center py-12 text-gray-300 text-sm">
                    No messages yet. Say something!
                  </div>
                ) : (
                  threadMessages.map((msg) => {
                    const isMe = msg.senderId === user?.id;
                    return (
                      <div key={msg.id} className={cn("flex items-end gap-2", isMe ? "flex-row-reverse" : "flex-row")}>
                        {!isMe && <Avatar name={msg.senderName} size="sm" />}
                        <div className="max-w-[70%]">
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
