interface PreflightBadgeProps {
  issueCount: number;
  onClick?: () => void;
}

export function PreflightBadge({ issueCount, onClick }: PreflightBadgeProps) {
  if (issueCount === 0) return null;

  return (
    <span
      className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 bg-red-500 text-white rounded-full text-[10px] font-bold leading-none cursor-pointer z-10"
      onClick={onClick}
      title={`${issueCount} pre-flight issue${issueCount !== 1 ? "s" : ""}`}
    >
      {issueCount}
    </span>
  );
}
