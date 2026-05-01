import { getSupabaseClient } from "./client";
import { ChatMessage } from "@/components/Message";
import { ResumeExtraction } from "@/lib/agents/schemas/resumeExtraction";
import { ResumeAnalysis } from "@/lib/agents/schemas/resumeIntelligence";

export interface SupabaseChat {
  id: string;
  user_id: string;
  title: string;
  messages: ChatMessage[];
  mode: "chat" | "resume_builder";
  resume_text: string | null;
  resume_filename: string | null;
  resume_extraction: ResumeExtraction | null;
  resume_analysis: ResumeAnalysis | null;
  // The user's stated goal from onboarding's Career Goal question.
  // Null when the chat predates the feature OR the user skipped.
  career_goal: string | null;
  // Whether the user has already seen the Career Profile landing screen
  // for this chat. Set on first dismissal so it doesn't keep popping up.
  career_profile_seen: boolean;
  created_at: string;
  updated_at: string;
}

// ── localStorage fallback for unauthenticated users ──────────────────────────
// Chat persistence mirrors the localStorage-backed Drive approach. When no
// Supabase session exists, chats live in `stackle_chats` keyed by browser.
const LOCAL_CHATS_KEY = "stackle_chats";

function isLSAvailable(): boolean {
  if (typeof window === "undefined") return false;
  try {
    localStorage.setItem("__stackle_probe__", "1");
    localStorage.removeItem("__stackle_probe__");
    return true;
  } catch {
    return false;
  }
}

function readLocalChats(): SupabaseChat[] {
  if (!isLSAvailable()) return [];
  const raw = localStorage.getItem(LOCAL_CHATS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Partial<SupabaseChat>[];
    // Backfill defaults for chats stored before the career_profile fields existed.
    return parsed.map((c) => ({
      ...(c as SupabaseChat),
      career_goal: c.career_goal ?? null,
      career_profile_seen: c.career_profile_seen ?? false,
    }));
  } catch (err) {
    console.error("[chats] stackle_chats JSON corrupted, resetting:", err);
    try { localStorage.removeItem(LOCAL_CHATS_KEY); } catch { /* ignore */ }
    return [];
  }
}

function writeLocalChats(chats: SupabaseChat[]): void {
  if (!isLSAvailable()) return;
  try {
    localStorage.setItem(LOCAL_CHATS_KEY, JSON.stringify(chats));
  } catch (err) {
    console.error("[chats] writeLocalChats failed:", err);
  }
}

function nowISO() { return new Date().toISOString(); }
function localId(): string {
  return (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function loadChats(): Promise<SupabaseChat[]> {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return readLocalChats().sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }

  try {
    const { data, error } = await supabase
      .from("chats")
      .select("id, title, mode, messages, resume_text, resume_filename, resume_extraction, resume_analysis, career_goal, career_profile_seen, created_at, updated_at")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    // Backfill defaults for older rows that predate the career-profile feature.
    return (data ?? []).map((row) => ({
      ...row,
      career_goal: row.career_goal ?? null,
      career_profile_seen: row.career_profile_seen ?? false,
    })) as SupabaseChat[];
  } catch (err) {
    console.error("[chats] loadChats Supabase error, falling back to local:", err);
    return readLocalChats().sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }
}

export interface ChatSeed {
  resumeText?: string | null;
  resumeFilename?: string | null;
  resumeExtraction?: ResumeExtraction | null;
  resumeAnalysis?: ResumeAnalysis | null;
  careerGoal?: string | null;
}

export async function createChat(
  mode: "chat" | "resume_builder" = "chat",
  seed?: ChatSeed
): Promise<SupabaseChat> {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const chat: SupabaseChat = {
      id: localId(),
      user_id: "local",
      title: "New conversation",
      messages: [],
      mode,
      resume_text: seed?.resumeText ?? null,
      resume_filename: seed?.resumeFilename ?? null,
      resume_extraction: seed?.resumeExtraction ?? null,
      resume_analysis: seed?.resumeAnalysis ?? null,
      career_goal: seed?.careerGoal ?? null,
      career_profile_seen: false,
      created_at: nowISO(),
      updated_at: nowISO(),
    };
    const chats = readLocalChats();
    chats.push(chat);
    writeLocalChats(chats);
    return chat;
  }

  const { data, error } = await supabase
    .from("chats")
    .insert({
      user_id: user.id,
      title: "New conversation",
      messages: [],
      mode,
      resume_text: seed?.resumeText ?? null,
      resume_filename: seed?.resumeFilename ?? null,
      resume_extraction: seed?.resumeExtraction ?? null,
      resume_analysis: seed?.resumeAnalysis ?? null,
      career_goal: seed?.careerGoal ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as SupabaseChat;
}

export async function updateChat(
  id: string,
  patch: Partial<Pick<SupabaseChat, "title" | "messages" | "mode" | "resume_text" | "resume_filename" | "resume_extraction" | "resume_analysis" | "career_goal" | "career_profile_seen">>
): Promise<void> {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const chats = readLocalChats();
    const idx = chats.findIndex((c) => c.id === id);
    if (idx === -1) return;
    chats[idx] = { ...chats[idx], ...patch, updated_at: nowISO() };
    writeLocalChats(chats);
    return;
  }

  const { error } = await supabase
    .from("chats")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteChat(id: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    writeLocalChats(readLocalChats().filter((c) => c.id !== id));
    return;
  }

  const { error } = await supabase.from("chats").delete().eq("id", id);
  if (error) throw error;
}

/** Derive a chat title from the first user message */
export function deriveChatTitle(messages: ChatMessage[]): string {
  const first = messages.find((m) => m.role === "user");
  if (!first) return "New conversation";
  return first.content.slice(0, 42) + (first.content.length > 42 ? "…" : "");
}
