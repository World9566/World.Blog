"use client";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Icon } from "./icon";

export function GitHubLogin({
  returnTo,
  available,
}: {
  returnTo: string;
  available: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function login() {
    setBusy(true);
    setError("");
    try {
      const result = await authClient.signIn.social({
        provider: "github",
        callbackURL: returnTo,
        errorCallbackURL: "/login?error=oauth",
      });
      if (result.error) {
        setError(
          result.error.status === 429
            ? "操作有些频繁，请稍后重试。"
            : "暂时无法登录，请稍后重试。",
        );
        setBusy(false);
      }
    } catch {
      setError("连接未成功，请检查网络后重试。");
      setBusy(false);
    }
  }
  return (
    <div className="login-action">
      <button
        className="button button-primary github-login"
        type="button"
        disabled={!available || busy}
        onClick={login}
      >
        <Icon name="github" width="22" height="22" />
        {busy ? "正在前往 GitHub…" : "使用 GitHub 继续"}
      </button>
      {!available && (
        <p className="form-notice" role="status">
          登录暂时不可用，请稍后再来。
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
