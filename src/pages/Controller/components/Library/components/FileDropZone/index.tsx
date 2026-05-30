import { useFileDropOverlay } from "@/pages/Controller/hooks/useFileDropOverlay";
import overlayStyles from "@/pages/Controller/styles/fileDropOverlay.module.css";
import { getVideoFilesFromDataTransfer } from "@/pages/Controller/utils/videoItem";
import { useCallback } from "react";
import styles from "./index.module.css";

interface FileDropZoneProps {
  accept?: string;
  onFileLoad?: (text: string, filename?: string) => void;
  onVideoFilesLoad?: (files: File[]) => void;
  children: React.ReactNode;
  className?: string;
}

const FileDropZone = ({
  accept = ".txt",
  onFileLoad,
  onVideoFilesLoad,
  children,
  className = "",
}: FileDropZoneProps) => {
  const { isDragging, onDragOver, onDragLeave, onDropStart } = useFileDropOverlay();

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      onDropStart(e);

      const videoFiles = getVideoFilesFromDataTransfer(e.dataTransfer);
      if (videoFiles.length > 0) {
        onVideoFilesLoad?.(videoFiles);
        return;
      }

      if (!onFileLoad) {
        return;
      }

      const files = Array.from(e.dataTransfer.files);
      const acceptedFile = files.find((file) => {
        if (accept.startsWith(".")) {
          return file.name.endsWith(accept);
        }
        return file.type === accept || file.name.endsWith(accept);
      });

      if (!acceptedFile) {
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        if (text) {
          onFileLoad(text, acceptedFile.name);
        }
      };
      reader.onerror = () => {
        console.error("Failed to read file");
      };
      reader.readAsText(acceptedFile);
    },
    [accept, onFileLoad, onVideoFilesLoad, onDropStart]
  );

  return (
    <div
      className={`${styles.container} ${className}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={handleDrop}
    >
      {children}
      {isDragging && <div className={overlayStyles.overlay}>+</div>}
    </div>
  );
};

export default FileDropZone;
