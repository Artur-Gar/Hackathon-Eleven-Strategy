import { useRef, useState } from "react";
import { Upload, FileText, AlertCircle } from "lucide-react";
import { parseCSVText, parseGzippedCSV, RawRow } from "@/lib/DataProcessor";

interface FileUploaderProps {
  onDataLoaded: (rows: RawRow[]) => void;
  hasData: boolean;
}

export function FileUploader({ onDataLoaded, hasData }: FileUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setError(null);
    setLoading(true);
    setFileName(file.name);

    try {
      let rows: RawRow[];
      if (file.name.endsWith(".gz")) {
        const buffer = await file.arrayBuffer();
        rows = await parseGzippedCSV(buffer);
      } else {
        const text = await file.text();
        rows = await parseCSVText(text);
      }
      onDataLoaded(rows);
    } catch (e: any) {
      setError(e.message || "Failed to parse file");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div>
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
        className={`
          park-card p-6 text-center cursor-pointer transition-all
          hover:shadow-lg border-2 border-dashed border-border hover:border-park-accent
          ${hasData ? "py-3" : "py-8"}
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.gz"
          onChange={handleChange}
          className="hidden"
        />

        {loading ? (
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <div className="animate-spin w-5 h-5 border-2 border-park-accent border-t-transparent rounded-full" />
            <span className="text-sm font-semibold">Processing...</span>
          </div>
        ) : hasData && fileName ? (
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <FileText size={16} />
            <span className="text-sm font-semibold">{fileName}</span>
            <span className="text-xs">• Click or drop to replace</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Upload size={28} className="text-park-accent" />
            <p className="font-bold text-sm">
              Drop your CSV file here or click to upload
            </p>
            <p className="text-xs">Supports .csv and .csv.gz files</p>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-2 bg-destructive/10 text-destructive rounded-lg p-3">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <p className="text-sm font-semibold">{error}</p>
        </div>
      )}
    </div>
  );
}
