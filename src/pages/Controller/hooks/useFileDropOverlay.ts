import { useCallback, useEffect, useState } from "react";

interface UseFileDropOverlayOptions {
  /** true のとき Files 型のドラッグのみオーバーレイを表示 */
  filesOnly?: boolean;
}

let refCount = 0;
const clearDraggingListeners = new Set<() => void>();

const notifyClearDragging = () => {
  for (const clear of clearDraggingListeners) {
    clear();
  }
};

export const useFileDropOverlay = ({ filesOnly = false }: UseFileDropOverlayOptions = {}) => {
  const [isDragging, setIsDragging] = useState(false);

  const onDragOver = useCallback(
    (e: React.DragEvent) => {
      if (filesOnly && !e.dataTransfer.types.includes("Files")) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
    },
    [filesOnly]
  );

  const onDragLeave = useCallback((e: React.DragEvent) => {
    const relatedTarget = e.relatedTarget as Node | null;
    if (!e.currentTarget.contains(relatedTarget)) {
      setIsDragging(false);
    }
  }, []);

  const clearDragging = useCallback(() => {
    setIsDragging(false);
  }, []);

  const onDropStart = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  useEffect(() => {
    clearDraggingListeners.add(clearDragging);
    if (refCount === 0) {
      document.addEventListener("drop", notifyClearDragging);
      document.addEventListener("dragend", notifyClearDragging);
    }
    refCount += 1;
    return () => {
      clearDraggingListeners.delete(clearDragging);
      refCount -= 1;
      if (refCount === 0) {
        document.removeEventListener("drop", notifyClearDragging);
        document.removeEventListener("dragend", notifyClearDragging);
      }
    };
  }, [clearDragging]);

  return { isDragging, onDragOver, onDragLeave, onDropStart, clearDragging };
};
