"use client";

import React from "react";
import { API_URL } from "@/app/lib/api";

export async function fetchAndShowNotifications(
  username: string,
  isMyProfile: boolean,
  setToasts: React.Dispatch<React.SetStateAction<any[]>>,
  removeToast: (id: string) => void,
) {
  if (!isMyProfile) return;
  try {
    const res = await fetch(`${API_URL}/api/notifications/${username}`, {
      credentials: "include",
    });
    if (!res.ok) return;
    const unread = await res.json();
    if (unread.length === 0) return;

    setToasts((prev: any[]) => {
      const newToasts = [...prev];
      const existingIds = new Set(newToasts.map((t: any) => t.ach_id));
      for (const ach of unread) {
        if (!existingIds.has(ach.ua_id)) {
          const toastId = `${ach.ua_id}-${Date.now()}-${newToasts.length}`;
          newToasts.push({
            id: toastId,
            ach_id: ach.ua_id,
            name: ach.name,
            icon: ach.icon,
            xp: ach.reward_xp,
            image: ach.target_image,
          });
          setTimeout(() => removeToast(toastId), 6000);
        }
      }
      return newToasts;
    });

    await fetch(`${API_URL}/api/notifications/${username}/read`, {
      credentials: "include",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ua_ids: unread.map((d: any) => d.ua_id) }),
    });
  } catch (e) {
    console.error(e);
  }
}
