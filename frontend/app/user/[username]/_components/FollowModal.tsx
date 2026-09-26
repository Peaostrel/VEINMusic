"use client";

import { FollowModalContent } from "./FollowModalContent";
import type { ProfileViewProps } from "./useProfilePage";

export function FollowModal({
  router,
  followModal,
  setFollowModal,
}: ProfileViewProps) {
  return (
    <>
      {followModal.isOpen && (
        <dialog
          open
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm border-0 bg-transparent outline-none w-full h-full"
        >
          <button
            type="button"
            className="absolute inset-0 w-full h-full cursor-default border-none bg-transparent outline-none"
            aria-label="Закрыть"
            onClick={() =>
              setFollowModal({
                isOpen: false,
                type: "",
                title: "",
                users: [],
                loading: false,
              })
            }
          />
          <div className="bg-[#1a1a1a] rounded-2xl w-[400px] max-h-[80vh] shadow-2xl overflow-hidden relative border border-white/10 p-0 flex flex-col">
            <div className="p-4 border-b border-white/5 flex justify-between items-center bg-[#121212]">
              <h3 className="text-lg font-black text-[var(--accent-text)] uppercase tracking-wider">
                {followModal.title}
              </h3>
              <button
                type="button"
                onClick={() =>
                  setFollowModal({
                    isOpen: false,
                    type: "",
                    title: "",
                    users: [],
                    loading: false,
                  })
                }
                className="text-gray-400 hover:text-white transition-colors text-xl font-black border-none bg-transparent outline-none"
              >
                ✕
              </button>
            </div>
            <div className="overflow-y-auto p-2 custom-scrollbar flex-grow bg-[#121212]/50 backdrop-blur-sm">
              <FollowModalContent
                loading={followModal.loading}
                users={followModal.users}
                router={router}
                onClose={() =>
                  setFollowModal({
                    isOpen: false,
                    type: "",
                    title: "",
                    users: [],
                    loading: false,
                  })
                }
              />
            </div>
          </div>
        </dialog>
      )}
    </>
  );
}
