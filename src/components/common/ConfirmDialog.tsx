import { useI18n } from "../../i18n/I18nProvider";
import type { ReactNode } from "react";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
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
  children,
}: ConfirmDialogProps) {
  const { t } = useI18n();
  const finalConfirmLabel = confirmLabel || t("common.confirm");
  const finalCancelLabel = cancelLabel || t("common.cancel");

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
        <div className="dialog-card__actions">
          <button className="button button--ghost" onClick={onCancel} type="button">
            {finalCancelLabel}
          </button>
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
  );
}
