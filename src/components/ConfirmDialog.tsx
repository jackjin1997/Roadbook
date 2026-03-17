interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({ open, title, message, confirmLabel = "Delete", onConfirm, onCancel }: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 600, color: "var(--color-text)" }}>{title}</h3>
        <p style={{ margin: "0 0 20px", fontSize: 13, color: "var(--color-text-muted)", lineHeight: 1.5 }}>{message}</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onCancel}
            className="text-xs px-4 py-2 rounded-lg transition-colors"
            style={{ background: "var(--color-surface-hover)", color: "var(--color-text-muted)", border: "1px solid var(--color-border)" }}>
            Cancel
          </button>
          <button onClick={onConfirm}
            className="text-xs px-4 py-2 rounded-lg transition-colors"
            style={{ background: "#dc2626", color: "#fff", border: "none" }}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
