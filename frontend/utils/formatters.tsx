import React from "react";

export const getPlatformIcon = (source: string) => {
  switch (source) {
    case "spotify":
      return (
        <svg
          viewBox="0 0 24 24"
          fill="#1DB954"
          className="w-4 h-4 shrink-0 drop-shadow-[0_0_5px_rgba(29,185,84,0.5)]"
        >
          <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.54.66.3 1.02zm1.44-3.3c-.301.42-.84.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.02.6-1.14 4.32-1.38 9.72-.72 13.44 1.56.42.24.6.84.3 1.26zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.18-1.2-.18-1.38-.781-.18-.6.18-1.2.78-1.38 4.2-1.26 11.28-1.02 15.72 1.62.539.3.719 1.02.419 1.56-.239.54-.959.72-1.619.36z" />
        </svg>
      );
    case "youtube_music":
      return (
        <img
          src="https://img.icons8.com/?size=100&id=V1cbDThDpbRc&format=png&color=FF0000"
          alt="YouTube Music"
          className="w-4 h-4 shrink-0 object-contain drop-shadow-[0_0_5px_rgba(255,0,0,0.5)]"
        />
      );
    case "yandex_music":
      return (
        <img
          src="https://img.icons8.com/?size=100&id=nE1v3L17XFzU&format=png&color=FF0000"
          alt="Yandex Music"
          className="w-4 h-4 shrink-0 object-contain drop-shadow-[0_0_5px_rgba(255,204,0,0.5)]"
        />
      );
    case "lastfm":
      return (
        <svg
          viewBox="0 0 24 24"
          fill="#D51007"
          className="w-4 h-4 shrink-0 drop-shadow-[0_0_5px_rgba(213,16,7,0.5)]"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M10.584 17.21l-.88-2.392s-1.43 1.594-3.573 1.594c-1.897 0-3.244-1.649-3.244-4.288 0-3.382 1.704-4.591 3.381-4.591 2.42 0 3.189 1.567 3.849 3.574l.88 2.749c.88 2.666 2.529 4.81 7.285 4.81 3.409 0 5.718-1.044 5.718-3.793 0-2.227-1.265-3.381-3.63-3.931l-1.758-.385c-1.21-.275-1.567-.77-1.567-1.595 0-.934.742-1.484 1.952-1.484 1.32 0 2.034.495 2.144 1.677l2.749-.33c-.22-2.474-1.924-3.492-4.729-3.492-2.474 0-4.893.935-4.893 3.932 0 1.87.907 3.051 3.189 3.601l1.87.44c1.402.33 1.869.907 1.869 1.704 0 1.017-.99 1.43-2.86 1.43-2.776 0-3.93-1.457-4.59-3.464l-.907-2.75c-1.155-3.573-2.997-4.893-6.653-4.893C2.144 5.333 0 7.89 0 12.233c0 4.18 2.144 6.434 5.993 6.434 3.106 0 4.591-1.457 4.591-1.457z" />
        </svg>
      );
    default:
      return null;
  }
};

export const formatTimeAgo = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return "только что";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} м назад`;
  if (diffInSeconds < 86400)
    return `${Math.floor(diffInSeconds / 3600)} ч назад`;
  return `${Math.floor(diffInSeconds / 86400)} д назад`;
};
