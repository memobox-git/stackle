import { getSupabaseClient } from "./client";
import { ResumeExtraction } from "@/lib/agents/schemas/resumeExtraction";
import { ResumeAnalysis } from "@/lib/agents/schemas/resumeIntelligence";

export type DriveFileType = "original" | "working_copy" | "version" | "report";

export interface DriveFile {
  id: string;
  user_id: string;
  chat_id: string | null;
  display_name: string;
  candidate_name: string | null;
  target_role: string | null;
  file_type: DriveFileType;
  bucket: string;
  storage_path: string | null;
  version_number: number | null;
  parent_id: string | null;
  is_read_only: boolean;
  is_current: boolean;
  extraction_json: ResumeExtraction | null;
  analysis_json: ResumeAnalysis | null;
  created_at: string;
  updated_at: string;
}

function fmtDate(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function safeName(s: string) {
  return s.replace(/[^a-zA-Z0-9_\-]/g, "_");
}

// ── localStorage-backed Drive (fallback when no Supabase session) ─────────────
// When `supabase.auth.getUser()` returns no user, every Drive helper routes
// here instead of silently returning null. Same DriveFile shape, same
// behaviour — just persisted in one localStorage key per browser.
const LOCAL_DRIVE_KEY = "stackle_drive";

function isLocalStorageAvailable(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const k = "__stackle_probe__";
    window.localStorage.setItem(k, "1");
    window.localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

function readLocalDrive(): DriveFile[] {
  if (!isLocalStorageAvailable()) return [];
  const raw = localStorage.getItem(LOCAL_DRIVE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as DriveFile[];
  } catch (err) {
    console.error("[drive] stackle_drive JSON is corrupted, resetting:", err);
    try { localStorage.removeItem(LOCAL_DRIVE_KEY); } catch { /* ignore */ }
    return [];
  }
}

function writeLocalDrive(files: DriveFile[]): boolean {
  if (!isLocalStorageAvailable()) return false;
  try {
    localStorage.setItem(LOCAL_DRIVE_KEY, JSON.stringify(files));
    return true;
  } catch (err) {
    const isQuota = err instanceof DOMException && (
      err.name === "QuotaExceededError" ||
      err.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      err.code === 22
    );
    if (isQuota) {
      // Prune strategy: drop oldest non-original rows until it fits, keep
      // originals (user's uploaded resumes are the most precious).
      console.warn("[drive] localStorage quota hit, pruning old versions");
      const pruned = pruneLocalDrive(files);
      try {
        localStorage.setItem(LOCAL_DRIVE_KEY, JSON.stringify(pruned));
        // Best-effort toast via custom event — page.tsx can listen.
        window.dispatchEvent(new CustomEvent("stackle-drive-pruned", {
          detail: { removed: files.length - pruned.length },
        }));
        return true;
      } catch (err2) {
        console.error("[drive] pruning didn't free enough space:", err2);
        return false;
      }
    }
    console.error("[drive] writeLocalDrive failed:", err);
    return false;
  }
}

function pruneLocalDrive(files: DriveFile[]): DriveFile[] {
  // Keep all originals + the 5 most recent non-original rows.
  const originals = files.filter((f) => f.file_type === "original");
  const others = files
    .filter((f) => f.file_type !== "original")
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 5);
  return [...originals, ...others];
}

function nowISO() {
  return new Date().toISOString();
}

function makeLocalFile(overrides: Partial<DriveFile>): DriveFile {
  return {
    id: (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    user_id: "local",
    chat_id: null,
    display_name: "",
    candidate_name: null,
    target_role: null,
    file_type: "original",
    bucket: "local",
    storage_path: null,
    version_number: null,
    parent_id: null,
    is_read_only: false,
    is_current: true,
    extraction_json: null,
    analysis_json: null,
    created_at: nowISO(),
    updated_at: nowISO(),
    ...overrides,
  };
}

// ── Upload JSON to storage ────────────────────────────────────────────────────
async function uploadJson(bucket: string, path: string, payload: unknown) {
  const supabase = getSupabaseClient();
  const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
  const { error } = await supabase.storage.from(bucket).upload(path, blob, { upsert: true });
  if (error) console.warn("Drive storage upload failed:", error.message);
}

// ── Task 1: Save original on upload ──────────────────────────────────────────
export async function saveOriginalResume({
  chatId,
  extraction,
  rawText,
  filename,
}: {
  chatId: string;
  extraction: ResumeExtraction;
  rawText: string;
  filename?: string;
}): Promise<DriveFile | null> {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  const name = extraction.name || "Resume";
  const date = fmtDate();
  const baseName = (filename ?? "").replace(/\.(pdf|docx|doc)$/i, "").trim();
  const displayName = baseName || `${name}_Original_${date}`;

  if (!user) {
    // Local fallback — push directly to localStorage, no blob upload.
    // Dedup: if an "original" already exists for this chat, reuse it.
    const files = readLocalDrive();
    const existing = files.find((f) => f.chat_id === chatId && f.file_type === "original");
    if (existing) return existing;
    const file = makeLocalFile({
      chat_id: chatId,
      display_name: displayName,
      candidate_name: name,
      file_type: "original",
      is_read_only: true,
      is_current: true,
      extraction_json: extraction,
    });
    files.push(file);
    writeLocalDrive(files);
    return file;
  }

  // Dedup: if this chat already has an "original" row, return it instead
  // of inserting another. The previous behaviour inserted a new row every
  // call, which is why uploading once produced 4+ duplicate Drive entries
  // when multiple effects fired in parallel (auto-save effect + the
  // explicit handleResumeUpload save path).
  const { data: existing } = await supabase
    .from("drive_files")
    .select("*")
    .eq("user_id", user.id)
    .eq("chat_id", chatId)
    .eq("file_type", "original")
    .limit(1)
    .maybeSingle();
  if (existing) return existing as DriveFile;

  const storagePath = `${user.id}/${safeName(displayName)}.json`;
  await uploadJson("resumes", storagePath, { extraction, rawText, filename });

  const { data, error } = await supabase
    .from("drive_files")
    .insert({
      user_id: user.id,
      chat_id: chatId,
      display_name: displayName,
      candidate_name: name,
      file_type: "original",
      bucket: "resumes",
      storage_path: storagePath,
      is_read_only: true,
      is_current: true,
      extraction_json: extraction,
    })
    .select()
    .single();

  if (error) { console.warn("Drive insert failed:", error.message); return null; }
  return data as DriveFile;
}

// ── Task 2: Create working copy when edit starts ──────────────────────────────
export async function createWorkingCopy({
  parentId,
  chatId,
  extraction,
}: {
  parentId: string;
  chatId: string;
  extraction: ResumeExtraction;
}): Promise<DriveFile | null> {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  const name = extraction.name || "Resume";
  const date = fmtDate();
  const displayName = `${name}_Editing_${date}`;

  if (!user) {
    // Local fallback — drop previous working copies for this parent, push a new one
    const files = readLocalDrive().filter(
      (f) => !(f.parent_id === parentId && f.file_type === "working_copy")
    );
    const file = makeLocalFile({
      chat_id: chatId,
      display_name: displayName,
      candidate_name: name,
      file_type: "working_copy",
      parent_id: parentId,
      is_read_only: false,
      is_current: false,
      extraction_json: extraction,
    });
    files.push(file);
    writeLocalDrive(files);
    return file;
  }

  // Remove any previous working copies for this parent
  await supabase
    .from("drive_files")
    .delete()
    .eq("parent_id", parentId)
    .eq("file_type", "working_copy");

  const { data, error } = await supabase
    .from("drive_files")
    .insert({
      user_id: user.id,
      chat_id: chatId,
      display_name: displayName,
      candidate_name: name,
      file_type: "working_copy",
      bucket: "resumes",
      parent_id: parentId,
      is_read_only: false,
      is_current: false,
      extraction_json: extraction,
    })
    .select()
    .single();

  if (error) { console.warn("Working copy insert failed:", error.message); return null; }
  return data as DriveFile;
}

// ── Task 3: Finalize version when edit is accepted ────────────────────────────
// ── Update working copy in place ─────────────────────────────────────────────
// Persists edits made via Accept immediately so the user's tab can close
// without losing work. Does NOT promote to a numbered version — that's
// `finalizeVersion`'s job when the user explicitly hits "Save as v1".
export async function updateWorkingCopy({
  workingCopyId,
  extraction,
}: {
  workingCopyId: string;
  extraction: ResumeExtraction;
}): Promise<boolean> {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    // Local fallback — mutate the matching row in stackle_drive
    const files = readLocalDrive();
    const idx = files.findIndex((f) => f.id === workingCopyId && f.file_type === "working_copy");
    if (idx === -1) return false;
    files[idx] = {
      ...files[idx],
      extraction_json: extraction,
      updated_at: nowISO(),
    };
    return writeLocalDrive(files);
  }

  const { error } = await supabase
    .from("drive_files")
    .update({
      extraction_json: extraction,
      updated_at: new Date().toISOString(),
    })
    .eq("id", workingCopyId)
    .eq("file_type", "working_copy");

  if (error) {
    console.warn("[drive] updateWorkingCopy failed:", error.message);
    return false;
  }
  return true;
}

export async function finalizeVersion({
  workingCopyId,
  extraction,
  targetRole,
  parentId,
  customDisplayName,
}: {
  workingCopyId: string;
  extraction: ResumeExtraction;
  targetRole: string;
  parentId: string;
  // User-typed name from the completion modal. When present, overrides the
  // auto-generated "{Name}_{Role}_v{N}" format.
  customDisplayName?: string;
}): Promise<DriveFile | null> {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  const name = extraction.name || "Resume";
  const role = safeName(targetRole || "Edited");

  if (!user) {
    // Local fallback — promote the working_copy row to a version
    const files = readLocalDrive();
    const existingVersions = files.filter(
      (f) => f.parent_id === parentId && f.file_type === "version"
    ).length;
    const versionNumber = existingVersions + 1;
    const displayName = customDisplayName?.trim() || `${name}_${role}_v${versionNumber}`;
    const updated = files.map((f) => {
      if (f.id === workingCopyId) {
        return {
          ...f,
          display_name: displayName,
          target_role: targetRole,
          file_type: "version" as DriveFileType,
          version_number: versionNumber,
          is_current: true,
          extraction_json: extraction,
          updated_at: nowISO(),
        };
      }
      // Unset is_current on sibling non-original entries for this parent
      if (f.parent_id === parentId && f.file_type !== "original") {
        return { ...f, is_current: false };
      }
      return f;
    });
    writeLocalDrive(updated);
    return updated.find((f) => f.id === workingCopyId) ?? null;
  }

  const { count } = await supabase
    .from("drive_files")
    .select("*", { count: "exact", head: true })
    .eq("parent_id", parentId)
    .eq("file_type", "version");

  const versionNumber = (count ?? 0) + 1;
  const displayName = customDisplayName?.trim() || `${name}_${role}_v${versionNumber}`;

  // Mark previous current non-original as no longer current
  await supabase
    .from("drive_files")
    .update({ is_current: false })
    .eq("parent_id", parentId)
    .eq("is_current", true)
    .neq("file_type", "original");

  const storagePath = `${user.id}/${safeName(displayName)}.json`;
  await uploadJson("resumes", storagePath, { extraction });

  const { data, error } = await supabase
    .from("drive_files")
    .update({
      display_name: displayName,
      target_role: targetRole,
      file_type: "version",
      version_number: versionNumber,
      is_current: true,
      storage_path: storagePath,
      extraction_json: extraction,
      updated_at: new Date().toISOString(),
    })
    .eq("id", workingCopyId)
    .select()
    .single();

  if (error) { console.warn("Finalize version failed:", error.message); return null; }
  return data as DriveFile;
}

// ── Task 5: Save report ───────────────────────────────────────────────────────
export async function saveReport({
  chatId,
  parentDriveId,
  extraction,
  analysis,
  candidateName,
}: {
  chatId: string;
  parentDriveId: string | null;
  extraction: ResumeExtraction | null;
  analysis: ResumeAnalysis;
  candidateName: string;
}): Promise<DriveFile | null> {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  const date = fmtDate();
  const displayName = `${candidateName}_Report_${date}`;

  if (!user) {
    // Local fallback — full analysis inline, no blob.
    // Dedup: one report per chat. Update in place when called again
    // with fresh analysis (e.g. user accepted fixes that moved the score).
    const files = readLocalDrive();
    const idx = files.findIndex((f) => f.chat_id === chatId && f.file_type === "report");
    if (idx !== -1) {
      const updated = {
        ...files[idx],
        display_name: displayName,
        candidate_name: candidateName,
        extraction_json: extraction,
        analysis_json: analysis,
        updated_at: nowISO(),
      };
      files[idx] = updated;
      writeLocalDrive(files);
      return updated;
    }
    const file = makeLocalFile({
      chat_id: chatId,
      display_name: displayName,
      candidate_name: candidateName,
      file_type: "report",
      parent_id: parentDriveId,
      is_read_only: true,
      is_current: true,
      extraction_json: extraction,
      analysis_json: analysis,
    });
    files.push(file);
    writeLocalDrive(files);
    return file;
  }

  // Dedup: one report per chat. If a row already exists, update it in
  // place — never insert a second. Prevents the runaway "6 reports for
  // one upload" bug where every effect re-firing pushed a new row.
  const { data: existing } = await supabase
    .from("drive_files")
    .select("*")
    .eq("user_id", user.id)
    .eq("chat_id", chatId)
    .eq("file_type", "report")
    .limit(1)
    .maybeSingle();

  const storagePath = existing?.storage_path
    ?? `${user.id}/${safeName(displayName)}.json`;
  await uploadJson("reports", storagePath, { analysis, extraction });

  if (existing) {
    const { data, error } = await supabase
      .from("drive_files")
      .update({
        display_name: displayName,
        candidate_name: candidateName,
        extraction_json: extraction,
        analysis_json: analysis,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) { console.warn("Report update failed:", error.message); return null; }
    return data as DriveFile;
  }

  const { data, error } = await supabase
    .from("drive_files")
    .insert({
      user_id: user.id,
      chat_id: chatId,
      display_name: displayName,
      candidate_name: candidateName,
      file_type: "report",
      bucket: "reports",
      storage_path: storagePath,
      parent_id: parentDriveId,
      is_read_only: true,
      is_current: true,
      extraction_json: extraction,
      analysis_json: analysis,
    })
    .select()
    .single();

  if (error) { console.warn("Report save failed:", error.message); return null; }
  return data as DriveFile;
}

// ── Load drive files for a session ───────────────────────────────────────────
export async function loadDriveFiles(chatId: string): Promise<DriveFile[]> {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return readLocalDrive()
      .filter((f) => f.chat_id === chatId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  const { data, error } = await supabase
    .from("drive_files")
    .select("*")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true });
  if (error) return [];
  return (data ?? []) as DriveFile[];
}

// ── Load all drive files for a user (across sessions) ────────────────────────
export async function loadAllDriveFiles(): Promise<DriveFile[]> {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return readLocalDrive().sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  const { data, error } = await supabase
    .from("drive_files")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as DriveFile[];
}

// ── Restore a specific version's extraction ───────────────────────────────────
export async function restoreVersion(driveFileId: string): Promise<ResumeExtraction | null> {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const file = readLocalDrive().find((f) => f.id === driveFileId);
    return file?.extraction_json ?? null;
  }

  const { data, error } = await supabase
    .from("drive_files")
    .select("extraction_json")
    .eq("id", driveFileId)
    .single();
  if (error) return null;
  return data?.extraction_json as ResumeExtraction | null;
}

// ── Mark a version as current ─────────────────────────────────────────────────
export async function setCurrentVersion(driveFileId: string, parentId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const files = readLocalDrive().map((f) => {
      if (f.parent_id === parentId && f.file_type !== "original") {
        return { ...f, is_current: f.id === driveFileId, updated_at: f.id === driveFileId ? nowISO() : f.updated_at };
      }
      return f;
    });
    writeLocalDrive(files);
    return;
  }

  // Unset current on siblings
  await supabase
    .from("drive_files")
    .update({ is_current: false })
    .eq("parent_id", parentId)
    .neq("file_type", "original");
  // Set current
  await supabase
    .from("drive_files")
    .update({ is_current: true, updated_at: new Date().toISOString() })
    .eq("id", driveFileId);
}
