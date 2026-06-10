import { useEffect, useState } from "react";

let refCount = 0;
let isDraggingFile = false;
const listeners = new Set<(active: boolean) => void>();

const notify = () => {
  for (const listener of listeners) {
    listener(isDraggingFile);
  }
};

const hasFiles = (dataTransfer: DataTransfer | null): boolean => {
  return dataTransfer?.types.includes("Files") ?? false;
};

export const endFileDragGuard = () => {
  if (!isDraggingFile) {
    return;
  }
  isDraggingFile = false;
  notify();
};

const handleDragOver = (e: DragEvent) => {
  if (!hasFiles(e.dataTransfer)) {
    return;
  }
  e.preventDefault();
  if (!isDraggingFile) {
    isDraggingFile = true;
    notify();
  }
};

const handleDragEnd = () => {
  endFileDragGuard();
};

const handleDrop = () => {
  endFileDragGuard();
};

export const useFileDragGuard = (): boolean => {
  const [isFileDragActive, setIsFileDragActive] = useState(false);

  useEffect(() => {
    listeners.add(setIsFileDragActive);
    setIsFileDragActive(isDraggingFile);
    if (refCount === 0) {
      document.addEventListener("dragover", handleDragOver, true);
      document.addEventListener("dragend", handleDragEnd, true);
      document.addEventListener("drop", handleDrop, true);
    }
    refCount += 1;
    return () => {
      listeners.delete(setIsFileDragActive);
      refCount -= 1;
      if (refCount === 0) {
        document.removeEventListener("dragover", handleDragOver, true);
        document.removeEventListener("dragend", handleDragEnd, true);
        document.removeEventListener("drop", handleDrop, true);
      }
    };
  }, []);

  return isFileDragActive;
};
