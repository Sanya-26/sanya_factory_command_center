// DocumentDropzone — drag-drop multi-file upload for onboarding (§1.5 / S4).
//
// "Accept ANY file type" per the design — no client-side extension whitelist.
// Cleo reads what she can; the system stores everything; unknown formats get
// a polite in-chat fallback + admin notification once the runtime-server
// documents-worker is wired (see DEFERRED_ITEMS).
//
// Flow:
//   1. Drop or pick files.
//   2. For each file: hash on the client (sha256), upload to
//      client-documents/companies/{companyId}/documents/{document_id}.{ext}
//      via the supabase storage client (RLS gates owner-only writes).
//   3. INSERT a client_documents row with status='uploaded'. The runtime-
//      server worker picks it up + dispatches to the adapter registry.
//   4. UI shows per-file progress; on completion the row turns green and
//      Cleo references the doc in her next turn (chat handler reads
//      client_documents WHERE status='extracted').
//
// No upload concurrency cap for S4 simplicity; supabase storage handles
// parallel PUTs fine for the typical onboarding upload count (<10 docs).

import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, FileText, Loader2, Check, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase";

interface DocRow {
  id: string;
  original_filename: string;
  mime_type: string;
  byte_size: number;
  status: "uploaded" | "extracting" | "extracted" | "extraction-failed" | "unsupported-format";
  uploaded_at: string;
}

interface UploadingFile {
  tempId: string;
  filename: string;
  size: number;
  progress: "hashing" | "uploading" | "inserting" | "done" | "error";
  error?: string;
}

export function DocumentDropzone({ companyId }: { companyId: string }): JSX.Element {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [uploading, setUploading] = useState<UploadingFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    const { data } = await supabase
      .from("client_documents")
      .select("id, original_filename, mime_type, byte_size, status, uploaded_at")
      .eq("company_id", companyId)
      .order("uploaded_at", { ascending: false })
      .limit(20);
    setDocs((data ?? []) as DocRow[]);
  }, [companyId]);

  useEffect(() => {
    void reload();
    const ch = supabase
      .channel(`docs-${companyId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "client_documents",
          filter: `company_id=eq.${companyId}`,
        },
        () => void reload(),
      )
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [companyId, reload]);

  const handleFiles = useCallback(async (files: File[]) => {
    const tasks = files.map(async (file) => {
      const tempId = crypto.randomUUID();
      setUploading((u) => [...u, { tempId, filename: file.name, size: file.size, progress: "hashing" }]);
      try {
        const buf = await file.arrayBuffer();
        const sha = await sha256Hex(buf);

        setUploading((u) => u.map((x) => x.tempId === tempId ? { ...x, progress: "uploading" } : x));
        const docId = crypto.randomUUID();
        const ext = filenameExt(file.name);
        const storagePath = `companies/${companyId}/documents/${docId}${ext ? "." + ext : ""}`;
        const { data: session } = await supabase.auth.getSession();
        const userId = session.session?.user?.id ?? null;

        const { error: uploadErr } = await supabase.storage
          .from("client-documents")
          .upload(storagePath, file, {
            cacheControl: "3600",
            upsert: false,
            contentType: file.type || "application/octet-stream",
          });
        if (uploadErr) throw uploadErr;

        setUploading((u) => u.map((x) => x.tempId === tempId ? { ...x, progress: "inserting" } : x));
        const { error: insertErr } = await supabase.from("client_documents").insert({
          id: docId,
          company_id: companyId,
          original_filename: file.name,
          mime_type: file.type || "application/octet-stream",
          byte_size: file.size,
          storage_path: storagePath,
          sha256: sha,
          status: "uploaded",
          uploaded_by: userId,
        });
        if (insertErr) throw insertErr;
        setUploading((u) => u.map((x) => x.tempId === tempId ? { ...x, progress: "done" } : x));
        setTimeout(() => {
          setUploading((u) => u.filter((x) => x.tempId !== tempId));
        }, 1500);
      } catch (e) {
        setUploading((u) =>
          u.map((x) => x.tempId === tempId
            ? { ...x, progress: "error", error: (e as Error).message }
            : x),
        );
      }
    });
    await Promise.all(tasks);
    void reload();
  }, [companyId, reload]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length) void handleFiles(files);
  }, [handleFiles]);

  const onPick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length) void handleFiles(files);
    // Reset so picking the same file again triggers change.
    e.target.value = "";
  }, [handleFiles]);

  return (
    <div
      className={`doc-dropzone ${dragOver ? "drag-over" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        onChange={onPick}
        style={{ display: "none" }}
        aria-label="Upload documents"
      />
      <button
        type="button"
        className="doc-dropzone-btn"
        onClick={() => inputRef.current?.click()}
        title="Upload documents for Cleo to read"
      >
        <Upload className="h-4 w-4" />
        <span>Drop files for Cleo to read</span>
      </button>
      {(uploading.length > 0 || docs.length > 0) ? (
        <ul className="doc-dropzone-list">
          {uploading.map((u) => (
            <li key={u.tempId} className={`doc-row uploading status-${u.progress}`}>
              <Loader2 className="h-4 w-4 doc-row-icon animate-spin" />
              <span className="doc-row-name">{u.filename}</span>
              <span className="doc-row-status">
                {u.progress === "hashing" && "hashing…"}
                {u.progress === "uploading" && "uploading…"}
                {u.progress === "inserting" && "saving…"}
                {u.progress === "done" && "done"}
                {u.progress === "error" && (u.error ?? "failed")}
              </span>
            </li>
          ))}
          {docs.map((d) => (
            <li key={d.id} className={`doc-row status-${d.status}`}>
              {renderStatusIcon(d.status)}
              <span className="doc-row-name" title={d.original_filename}>{d.original_filename}</span>
              <span className="doc-row-status">{renderStatusLabel(d.status)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function renderStatusIcon(s: DocRow["status"]): JSX.Element {
  if (s === "extracted") return <Check className="h-4 w-4 doc-row-icon" />;
  if (s === "extraction-failed" || s === "unsupported-format") {
    return <AlertCircle className="h-4 w-4 doc-row-icon" />;
  }
  if (s === "extracting") return <Loader2 className="h-4 w-4 doc-row-icon animate-spin" />;
  return <FileText className="h-4 w-4 doc-row-icon" />;
}

function renderStatusLabel(s: DocRow["status"]): string {
  switch (s) {
    case "uploaded": return "queued";
    case "extracting": return "reading…";
    case "extracted": return "ready";
    case "extraction-failed": return "couldn't read";
    case "unsupported-format": return "format not supported yet";
  }
}

function filenameExt(name: string): string {
  const i = name.lastIndexOf(".");
  if (i < 0) return "";
  return name.slice(i + 1);
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", buf);
  const bytes = Array.from(new Uint8Array(hash));
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}
