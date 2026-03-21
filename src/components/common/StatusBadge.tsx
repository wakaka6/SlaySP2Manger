type StatusTone = "neutral" | "success" | "warning" | "danger" | "accent";

type StatusBadgeProps = {
  tone?: StatusTone;
  children: React.ReactNode;
};

export function StatusBadge({ tone = "neutral", children }: StatusBadgeProps) {
  return <span className={`status-badge status-badge--${tone}`}>{children}</span>;
}
