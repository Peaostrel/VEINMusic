"use client";

import { X } from "lucide-react";
import Dialog from "@/components/Dialog";
import { FollowModalContent } from "./FollowModalContent";
import type { ProfileViewProps } from "./useProfilePage";

const CLOSED = {
  isOpen: false,
  type: "",
  title: "",
  users: [],
  loading: false,
};

export function FollowModal({
  router,
  followModal,
  setFollowModal,
}: ProfileViewProps) {
  if (!followModal.isOpen) return null;
  const close = () => setFollowModal(CLOSED);
  return (
    <Dialog label={followModal.title || "Подписки"} onClose={close}>
      <div className="flex max-h-[80vh] w-full max-w-[400px] flex-col overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-base font-semibold">{followModal.title}</h2>
          <button
            type="button"
            onClick={close}
            aria-label="Закрыть"
            className="rounded p-1 text-fg-3 hover:text-fg"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <FollowModalContent
            loading={followModal.loading}
            users={followModal.users}
            router={router}
            onClose={close}
          />
        </div>
      </div>
    </Dialog>
  );
}
