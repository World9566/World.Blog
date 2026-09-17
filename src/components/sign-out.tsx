"use client";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function SignOut() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function signOut() {
    setBusy(true);
    setError("");
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error();
      window.location.assign("/");
    } catch {
      setError("退出未成功，请重试。");
      setBusy(false);
    }
  }
  return (
    <div className="sign-out-control">
      <button
        className="button button-secondary"
        disabled={busy}
        onClick={signOut}
        type="button"
      >
        {busy ? "正在退出…" : "退出登录"}
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
