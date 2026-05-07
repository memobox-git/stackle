import AuthForm from "@/components/auth/AuthForm";

export const metadata = { title: "Sign in · Stackle" };

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fafaf7] px-6 py-12">
      <AuthForm mode="signin" />
    </div>
  );
}
