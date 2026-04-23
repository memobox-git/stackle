import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

// SQL to run in Supabase:
// create table if not exists waitlist (
//   id uuid default gen_random_uuid() primary key,
//   email text unique not null,
//   created_at timestamptz default now()
// );
// alter table waitlist enable row level security;
// create policy "Anyone can join waitlist" on waitlist for insert with check (true);

export async function POST(req: NextRequest) {
  const { email } = await req.json();
  if (!email?.trim()) return NextResponse.json({ error: "Email required" }, { status: 400 });

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  const { error } = await supabase.from("waitlist").insert({ email: email.trim().toLowerCase() });
  if (error && error.code === "23505") {
    return NextResponse.json({ message: "Already on the list" });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ message: "Added" });
}
