"use client";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { PendingLabel } from "./pending-label";

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
        aria-busy={busy}
        onClick={signOut}
        type="button"
      >
        <PendingLabel pending={busy} label="正在退出">
          退出登录
        </PendingLabel>
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
