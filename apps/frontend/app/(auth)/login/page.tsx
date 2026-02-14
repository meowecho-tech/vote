import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <main className="fade-up relative flex min-h-[78vh] items-center justify-center">
      <div className="pointer-events-none absolute inset-x-0 top-8 h-44 bg-[radial-gradient(circle,rgba(29,78,216,0.13),transparent_70%)]" />
      <LoginForm />
    </main>
  );
}
