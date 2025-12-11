import { useEffect } from "react";

interface ToastProps {
  message: string;
  type?: "error" | "ok";
  onClose: () => void;
}

export function Toast({ message, type = "ok", onClose }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div className={`toast ${type === "error" ? "error" : "ok"}`}>
      {message}
    </div>
  );
}
