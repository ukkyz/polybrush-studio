"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

export default function NewProjectButton({
  children = "New simulation",
  className = "btn btn-accent",
  name,
}: {
  children?: ReactNode;
  className?: string;
  name?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name ?? `Untitled prototype ${new Date().toLocaleTimeString()}` }),
      });
      const data = (await response.json()) as { project?: { id: number } };
      if (data.project?.id) {
        router.push(`/studio/${data.project.id}`);
        return;
      }
      router.push("/");
    } catch {
      setBusy(false);
    }
  };

  return (
    <button type="button" onClick={create} disabled={busy} className={`${className} disabled:opacity-60`}>
      {busy ? "Creating…" : children}
    </button>
  );
}
