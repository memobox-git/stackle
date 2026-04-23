"use client";

import { getSupabaseClient } from "@/lib/supabase/client";

export default function SignInView() {
  async function handleGoogleSignIn() {
    const supabase = getSupabaseClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6">
      {/* Logo */}
      <div
        className="w-10 h-10 rounded-2xl flex items-center justify-center text-black text-sm font-bold mb-8"
        style={{ background: "linear-gradient(135deg, #fff7ad, #ffa9f9)" }}
      >
        S
      </div>

      <h1 className="text-2xl font-semibold text-gray-900 mb-2 text-center">
        Welcome to Stackle
      </h1>
      <p className="text-sm text-gray-500 mb-10 text-center">
        Career advisor for data & AI roles
      </p>

      <button
        onClick={handleGoogleSignIn}
        className="flex items-center gap-3 px-5 py-3 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition-colors text-sm font-medium text-gray-800 shadow-sm w-full max-w-xs justify-center"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
          <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
          <path d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
          <path d="M9 3.583c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.583 9 3.583z" fill="#EA4335"/>
        </svg>
        Continue with Google
      </button>

      <p className="text-xs text-gray-400 mt-6 text-center max-w-xs">
        By continuing, you agree to Stackle&apos;s Terms of Service and Privacy Policy.
      </p>
    </div>
  );
}
