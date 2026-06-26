"use client";

import React, { createContext, useContext, useState, useCallback } from "react";

export type ToastType = "success" | "error" | "info" | "warning";

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

export interface ConfirmOptions {
  message: string;
  onConfirm: () => void;
  onCancel?: () => void;
  confirmText?: string;
  cancelText?: string;
}

interface NotificationContextProps {
  toasts: Toast[];
  showToast: (message: string, type?: ToastType) => void;
  removeToast: (id: string) => void;
  confirm: (options: ConfirmOptions) => void;
}

const NotificationContext = createContext<NotificationContextProps | undefined>(undefined);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmOptions, setConfirmOptions] = useState<ConfirmOptions | null>(null);

  const showToast = useCallback((message: string, type: ToastType = "info") => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    setConfirmOptions(options);
  }, []);

  const handleConfirm = () => {
    if (confirmOptions) {
      // Execute callback, then close
      const cb = confirmOptions.onConfirm;
      setConfirmOptions(null);
      cb();
    }
  };

  const handleCancel = () => {
    if (confirmOptions) {
      const cb = confirmOptions.onCancel;
      setConfirmOptions(null);
      if (cb) cb();
    }
  };

  return (
    <NotificationContext.Provider value={{ toasts, showToast, removeToast, confirm }}>
      {children}
      {/* Toast Overlay Container */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto p-4 rounded-lg shadow-lg border text-xs font-mono transition-all duration-300 animate-slide-in flex justify-between items-center gap-4 ${
              t.type === "success"
                ? "bg-green-500/10 border-green-500/20 text-green-500"
                : t.type === "error"
                ? "bg-red-500/10 border-red-500/20 text-red-500"
                : t.type === "warning"
                ? "bg-yellow-500/10 border-yellow-500/20 text-yellow-500"
                : "bg-card-sem border-border-sem text-foreground-sem"
            }`}
          >
            <span>{t.message}</span>
            <button
              onClick={() => removeToast(t.id)}
              className="text-neutral-400 hover:text-foreground-sem font-bold text-sm shrink-0"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Confirmation Dialog Modal */}
      {confirmOptions && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="flat-card bg-canvas-light dark:bg-canvas-dark border border-border-sem p-6 rounded-lg w-full max-w-md flex flex-col gap-4 font-mono text-xs shadow-2xl animate-fade-in">
            <h3 className="text-sm font-bold text-foreground-sem uppercase tracking-wider">Confirm Action</h3>
            <p className="text-neutral-400 leading-relaxed">{confirmOptions.message}</p>
            <div className="flex justify-end gap-3 mt-2 select-none">
              <button
                onClick={handleCancel}
                className="border border-border-sem rounded px-4 py-2 hover:bg-input-sem transition-all font-bold cursor-pointer"
              >
                {confirmOptions.cancelText || "CANCEL"}
              </button>
              <button
                onClick={handleConfirm}
                className="bg-accent-sem text-white border border-accent-sem rounded px-4 py-2 hover:bg-accent-sem/85 transition-all font-bold cursor-pointer"
              >
                {confirmOptions.confirmText || "PROCEED"}
              </button>
            </div>
          </div>
        </div>
      )}
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotification must be used within a NotificationProvider");
  }
  return context;
}
