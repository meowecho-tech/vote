import { OtpForm } from "@/components/auth/otp-form";

export default function VerifyOtpPage() {
  return (
    <main className="fade-up relative flex min-h-[78vh] items-center justify-center">
      <div className="pointer-events-none absolute inset-x-0 top-8 h-44 bg-[radial-gradient(circle,rgba(220,38,38,0.12),transparent_70%)]" />
      <OtpForm />
    </main>
  );
}
