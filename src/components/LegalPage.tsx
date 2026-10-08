import Link from "next/link";
import { WmxWordmark } from "./wmx-wordmark";

export const LEGAL_EFFECTIVE_DATE = "October 8, 2026";

/** Contact for privacy and terms questions; set LEGAL_CONTACT_EMAIL in Vercel. */
export function legalContact(): string | null {
  const v = (process.env.LEGAL_CONTACT_EMAIL ?? "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null;
}

export function ContactLine() {
  const email = legalContact();
  return email ? (
    <a href={`mailto:${email}`} className="font-medium text-[#1C2B47] underline underline-offset-2">
      {email}
    </a>
  ) : (
    <span>WMX Management Group through your usual WMX contact</span>
  );
}

/** Public page shell for the Privacy Policy and Terms of Service (no sign-in needed). */
export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#F5F3EE]">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <WmxWordmark />
          <Link href="/login" className="text-sm font-medium text-[#B08D57] hover:underline">
            Sign in
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10">
        <article className="rounded-lg border border-zinc-200 bg-white p-6 sm:p-10">
          <h1 className="text-2xl font-semibold text-zinc-900">{title}</h1>
          <p className="mt-1 text-sm text-zinc-500">Effective {LEGAL_EFFECTIVE_DATE}</p>
          <div className="legal mt-8 space-y-6 text-[15px] leading-relaxed text-zinc-700 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-zinc-900 [&_li]:mt-1 [&_ul]:list-disc [&_ul]:pl-5">
            {children}
          </div>
        </article>
        <nav className="mt-6 flex justify-center gap-6 text-sm text-zinc-500">
          <Link href="/privacy" className="hover:text-zinc-900 hover:underline">
            Privacy Policy
          </Link>
          <Link href="/terms" className="hover:text-zinc-900 hover:underline">
            Terms of Service
          </Link>
        </nav>
      </main>
    </div>
  );
}
