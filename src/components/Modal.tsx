import { useEffect, useRef, type FormEvent, type ReactNode } from 'react';

interface Props {
  title: string;
  onClose: () => void;
  onSubmit?: (e: FormEvent) => void;
  children: ReactNode;
  footer: ReactNode;
  narrow?: boolean;
}

export function Modal({ title, onClose, onSubmit, children, footer, narrow }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dlg = ref.current;
    if (dlg && !dlg.open) dlg.showModal?.();
  }, []);

  return (
    <dialog
      ref={ref}
      className={`modal ${narrow ? 'modal-narrow' : ''}`}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit?.(e);
        }}
      >
        <header className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="modal-body">{children}</div>
        <footer className="modal-foot">{footer}</footer>
      </form>
    </dialog>
  );
}
