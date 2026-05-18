// NotificationBell — header bell + inline dropdown feed.
//
// Subscribes to `notifications WHERE recipient_user_id = auth.uid()` via
// Supabase Realtime. Badge shows unread count. Click opens dropdown of
// most recent 20 rows. Clicking a row marks read + (if related_company_id)
// navigates to the customer detail page in the Cleo department.

import { useEffect, useRef, useState } from "react";
import { getFactorySupabase } from "../lib/factorySupabase";
import { navigate, type Route } from "../shell/route";

interface Notification {
  id: string;
  kind: string;
  severity: "info" | "success" | "warning" | "error";
  title: string;
  body: string | null;
  context: Record<string, unknown> | null;
  related_company_id: string | null;
  related_event_id: string | null;
  read_at: string | null;
  created_at: string;
}

const FEED_LIMIT = 20;

export function NotificationBell(): JSX.Element | null {
  const [userId, setUserId] = useState<string | null>(null);
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Resolve the current user once on mount.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const sb = getFactorySupabase();
      const { data } = await sb.auth.getSession();
      if (!cancelled) setUserId(data.session?.user?.id ?? null);
    })();
    return () => { cancelled = true; };
  }, []);

  // Fetch + subscribe once the user id is known.
  useEffect(() => {
    if (!userId) return;
    const sb = getFactorySupabase();
    let cancelled = false;

    const refetch = async () => {
      const { data } = await sb
        .from("notifications")
        .select("*")
        .eq("recipient_user_id", userId)
        .order("created_at", { ascending: false })
        .limit(FEED_LIMIT);
      if (!cancelled) setItems((data ?? []) as Notification[]);
    };
    void refetch();

    const ch = sb
      .channel(`notifications-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `recipient_user_id=eq.${userId}`,
        },
        () => void refetch(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      void sb.removeChannel(ch);
    };
  }, [userId]);

  // Close dropdown on outside click.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  if (!userId) return null;

  const unreadCount = items.filter((n) => n.read_at === null).length;

  const markRead = async (ids: string[]) => {
    if (!ids.length) return;
    const sb = getFactorySupabase();
    await sb
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .in("id", ids);
  };

  const handleItemClick = async (n: Notification) => {
    if (!n.read_at) void markRead([n.id]);
    if (n.related_company_id) {
      const target: Route = {
        dept: "cleo",
        section: "customers",
        id: n.related_company_id,
        sub: "overview",
      };
      navigate(target);
      setOpen(false);
    }
  };

  const handleMarkAllRead = async () => {
    const ids = items.filter((n) => !n.read_at).map((n) => n.id);
    if (ids.length) await markRead(ids);
  };

  return (
    <div ref={wrapperRef} className="notif-bell">
      <button
        type="button"
        className="notif-bell-trigger"
        aria-label={`Notifications — ${unreadCount} unread`}
        onClick={() => setOpen((v) => !v)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unreadCount > 0 ? (
          <span className="notif-bell-badge" aria-hidden>
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="notif-feed" role="menu">
          <div className="notif-feed-header">
            <strong>Notifications</strong>
            {unreadCount > 0 ? (
              <button type="button" className="btn btn-ghost notif-feed-mark-all"
                      onClick={() => void handleMarkAllRead()}>
                mark all read
              </button>
            ) : null}
          </div>
          {items.length === 0 ? (
            <div className="notif-feed-empty">No notifications yet.</div>
          ) : (
            <ul className="notif-feed-list">
              {items.map((n) => (
                <li
                  key={n.id}
                  className={`notif-item severity-${n.severity} ${n.read_at ? "read" : "unread"}`}
                >
                  <button
                    type="button"
                    className="notif-item-row"
                    onClick={() => void handleItemClick(n)}
                  >
                    <span className={`notif-item-dot severity-${n.severity}`} aria-hidden />
                    <span className="notif-item-body">
                      <span className="notif-item-title">{n.title}</span>
                      {n.body ? (
                        <span className="notif-item-sub">{n.body}</span>
                      ) : null}
                      <span className="notif-item-time">{formatRelative(n.created_at)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const sec = Math.max(0, Math.floor((now - then) / 1000));
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}
