"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { parseProfile } from "@/lib/account-policy";

export function ProfileForm({
  initialName,
  initialBio,
}: {
  initialName: string;
  initialBio: string;
}) {
  const { refetch } = authClient.useSession();
  const [name, setName] = useState(initialName);
  const [bio, setBio] = useState(initialBio);
  const [saved, setSaved] = useState({ name: initialName, bio: initialBio });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const router = useRouter();
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseProfile({ name, bio });
    if (!parsed.ok) {
      setError(true);
      setMessage(parsed.message);
      return;
    }
    setBusy(true);
    setMessage("");
    setError(false);
    try {
      const response = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 401) router.push("/login?next=%2Faccount");
        setError(true);
        setMessage(result?.message || "保存未成功，请稍后重试。");
        return;
      }
      if (!result?.profile) throw new Error();
      setName(result.profile.name);
      setBio(result.profile.bio);
      setSaved(result.profile);
      setMessage("个人资料已保存。");
      await refetch();
      router.refresh();
    } catch {
      setError(true);
      setMessage("连接未成功，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="profile-form" onSubmit={save}>
      <div className="form-field">
        <label htmlFor="profile-name">昵称</label>
        <input
          id="profile-name"
          name="name"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setMessage("");
          }}
          minLength={2}
          maxLength={40}
          required
          autoComplete="nickname"
          aria-describedby="name-hint"
        />
        <p id="name-hint" className="field-hint">
          2 到 40 个字符。
        </p>
      </div>
      <div className="form-field">
        <label htmlFor="profile-bio">
          个人简介 <span>选填</span>
        </label>
        <textarea
          id="profile-bio"
          name="bio"
          rows={4}
          value={bio}
          onChange={(event) => {
            setBio(event.target.value);
            setMessage("");
          }}
          maxLength={500}
          placeholder="聊聊你的兴趣，或正在探索的事情。"
          aria-describedby="bio-count"
        />
        <p id="bio-count" className="field-hint field-count">
          {bio.length} / 500
        </p>
      </div>
      <div className="form-actions">
        <button
          className="button button-primary"
          type="submit"
          disabled={busy || (name === saved.name && bio === saved.bio)}
        >
          {busy ? "正在保存…" : "保存修改"}
        </button>
        <p
          role={error ? "alert" : "status"}
          className={error ? "form-error" : "form-success"}
        >
          {message}
        </p>
      </div>
    </form>
  );
}
