import AuthForm from "@/components/auth/AuthForm";

export const metadata = { title: "Sign up · Stackle" };

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fafaf7] px-6 py-12">
      <AuthForm mode="signup" />
    </div>
  );
}
