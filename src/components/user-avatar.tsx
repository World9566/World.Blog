"use client";
import { useState } from "react";
import { safeAvatar } from "@/lib/account-policy";

export function UserAvatar({
  name,
  image,
  large = false,
}: {
  name: string;
  image?: string | null;
  large?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const source = safeAvatar(image);
  return (
    <span
      className={`user-avatar${large ? " user-avatar-large" : ""}`}
      aria-hidden="true"
    >
      {source && !failed ? (
        <img
          src={source}
          alt=""
          width={large ? 80 : 28}
          height={large ? 80 : 28}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        name.slice(0, 1).toLocaleUpperCase()
      )}
    </span>
  );
}
