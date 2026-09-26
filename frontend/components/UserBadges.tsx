const BADGE_PATH =
  "M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.154-.435.238-.905.238-1.4 0-2.21-1.71-3.998-3.918-3.998-.47 0-.92.084-1.336.25C14.818 2.415 13.51 1.5 12 1.5s-2.816.917-3.337 2.25c-.416-.165-.866-.25-1.336-.25-2.21 0-3.918 1.79-3.918 4 0 .495.084.965.238 1.4-1.273.65-2.148 2.02-2.148 3.6 0 1.46.74 2.746 1.846 3.45-.05.22-.077.447-.077.68 0 2.21 1.71 3.998 3.918 3.998.47 0 .92-.084 1.336-.25C8.49 21.585 9.796 22.5 11.25 22.5c1.455 0 2.76-.915 3.338-2.25.416.166.866.25 1.336.25 2.21 0 3.918-1.79 3.918-4 0-.233-.026-.46-.077-.68 1.106-.704 1.846-1.99 1.846-3.45z";
const CHECK_PATH =
  "M10.25 16.5l-3.5-3.5 1.414-1.414 2.086 2.086 5.586-5.586 1.414 1.414-7 7z";

/** Developer badge for staff, blue check for testers and verified users. */
export const VerifiedBadge = ({
  role,
  isVerified,
  sizeClass = "w-5 h-5",
}: {
  role?: string;
  isVerified?: boolean;
  sizeClass?: string;
}) => {
  if (role === "developer" || role === "admin")
    return (
      <span
        className="inline-flex items-center justify-center ml-1"
        title="Разработчик VEIN"
      >
        <svg
          viewBox="0 0 24 24"
          role="img"
          aria-label="Разработчик VEIN"
          className={`${sizeClass} drop-shadow-[0_0_8px_var(--accent-glow-strong)] shrink-0`}
        >
          <path
            fill="#1a1a1a"
            stroke="var(--accent)"
            strokeWidth="1.2"
            d={BADGE_PATH}
          ></path>
          <path fill="var(--accent)" d={CHECK_PATH}></path>
        </svg>
      </span>
    );
  if (role === "tester" || isVerified) {
    const label = role === "tester" ? "Тестировщик" : "Верифицирован";
    return (
      <span
        className="inline-flex items-center justify-center ml-1"
        title={label}
      >
        <svg
          viewBox="0 0 24 24"
          role="img"
          aria-label={label}
          className={`${sizeClass} drop-shadow-[0_0_8px_rgba(29,155,240,0.6)] shrink-0`}
        >
          <path fill="#1D9BF0" d={BADGE_PATH}></path>
          <path fill="#ffffff" d={CHECK_PATH}></path>
        </svg>
      </span>
    );
  }
  return null;
};

export const LvlBadge = ({ level }: { level: number }) => {
  return (
    <span
      className={`ml-2 inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border border-[var(--accent)] text-[var(--accent)] bg-[#121212] shadow-[0_0_5px_var(--accent-glow)] shrink-0`}
    >
      LVL {level || 1}
    </span>
  );
};
