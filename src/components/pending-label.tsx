import type { ReactNode } from "react";

export function LoadingSpinner() {
  return <span className="loading-spinner" aria-hidden="true" />;
}

// Keep the original label's footprint while the action is in flight.
export function PendingLabel({
  pending,
  label,
  children,
}: {
  pending: boolean;
  label: string;
  children: ReactNode;
}) {
  return (
    <span className="pending-label" data-pending={pending || undefined}>
      <span className="pending-label-idle" aria-hidden={pending || undefined}>
        {children}
      </span>
      {pending && (
        <span className="pending-label-progress" role="status">
          <LoadingSpinner />
          <span className="sr-only">{label}</span>
        </span>
      )}
    </span>
  );
}
