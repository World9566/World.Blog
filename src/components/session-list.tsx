"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./icon";

export type SessionItem = {
  id: string;
  device: string;
  createdAt: string;
  current: boolean;
};
export function SessionList({ sessions }: { sessions: SessionItem[] }) {
  const [pending, setPending] = useState("");
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const router = useRouter();
  async function revoke(sessionId?: string) {
    setPending(sessionId || "others");
    setMessage("");
    setFailed(false);
    try {
      const response = await fetch("/api/account/sessions/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sessionId ? { sessionId } : { allOthers: true }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 401) router.push("/login?next=%2Faccount");
        setFailed(true);
        setMessage(result?.message || "操作未成功，请稍后重试。");
        return;
      }
      if (!result?.message) throw new Error();
      setMessage(result.message);
      router.refresh();
    } catch {
      setFailed(true);
      setMessage("连接未成功，请稍后重试。");
    } finally {
      setPending("");
    }
  }
  return (
    <div className="sessions">
      <ul className="session-list">
        {sessions.map((session) => (
          <li key={session.id}>
            <span className="session-icon">
              <Icon name="device" width="24" height="24" />
            </span>
            <div className="session-info">
              <h3>
                {session.device}
                {session.current && (
                  <span className="current-session">当前设备</span>
                )}
              </h3>
              <p>登录于 {session.createdAt}</p>
            </div>
            {!session.current && (
              <button
                className="session-revoke"
                disabled={!!pending}
                type="button"
                onClick={() => revoke(session.id)}
                aria-label={`退出 ${session.device}，登录于 ${session.createdAt}`}
              >
                {pending === session.id ? "正在退出…" : "退出此设备"}
              </button>
            )}
          </li>
        ))}
      </ul>
      {sessions.some((session) => !session.current) && (
        <button
          className="button button-secondary"
          disabled={!!pending}
          onClick={() => revoke()}
          type="button"
        >
          {pending === "others" ? "正在退出…" : "退出其他设备"}
        </button>
      )}
      <p
        role={failed ? "alert" : "status"}
        className={failed ? "form-error" : "form-success"}
      >
        {message}
      </p>
    </div>
  );
}
