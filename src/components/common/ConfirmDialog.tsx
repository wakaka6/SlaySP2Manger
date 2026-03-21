import { useI18n } from "../../i18n/I18nProvider";
import { type ReactNode, useEffect } from "react";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
  onDismiss?: () => void;
  dismissLabel?: string;
  children?: ReactNode;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = "default",
  onConfirm,
  onCancel,
  onDismiss,
  dismissLabel,
  children,
}: ConfirmDialogProps) {
  const { t } = useI18n();
  const finalConfirmLabel = confirmLabel || t("common.confirm");
  const finalCancelLabel = cancelLabel || t("common.cancel");

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (onDismiss) {
          onDismiss();
        } else {
          onCancel();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onCancel, onDismiss]);

  if (!open) {
    return null;
  }

  return (
    <div className="dialog-overlay" role="presentation">
      <div aria-label={title} aria-modal="true" className="dialog-card" role="dialog">
        <div className="dialog-card__header">
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {children ? <div className="dialog-card__body">{children}</div> : null}
        <div className="dialog-card__actions" style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
          <div className="dialog-actions__left">
            {onDismiss && dismissLabel ? (
              <button className="button button--ghost" onClick={onDismiss} type="button">
                {dismissLabel}
              </button>
            ) : (
              <button className="button button--ghost" onClick={onCancel} type="button">
                {finalCancelLabel}
              </button>
            )}
          </div>
          <div className="dialog-actions__right" style={{ display: "flex", gap: "8px" }}>
            {onDismiss && dismissLabel && (
              <button className="button button--ghost" onClick={onCancel} type="button">
                {finalCancelLabel}
              </button>
            )}
            <button
              className={`button ${tone === "danger" ? "button--danger" : "button--primary"}`}
              onClick={onConfirm}
              type="button"
            >
              {finalConfirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
