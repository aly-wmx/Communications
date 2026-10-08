import type { Metadata } from "next";
import Link from "next/link";
import { ContactLine, LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Terms of Service · WMX Client Communications" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service">
      <p>
        These terms apply to WMX Client Communications (&ldquo;the Portal&rdquo;), an internal tool operated by WMX Management
        Group (&ldquo;WMX&rdquo;) for Watermark Design Build and other WMX businesses. By signing in, you agree to them.
      </p>

      <h2>Who may use the Portal</h2>
      <p>
        The Portal is for authorized WMX staff and contractors only. Access is granted and removed by WMX administrators. You may
        not share your account or let anyone else use it.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>Keep your sign-in secure. Use &ldquo;Continue with Google&rdquo; or a strong, unique password.</li>
        <li>Tell an administrator straight away if you think someone else has used your account.</li>
        <li>You are responsible for activity under your account.</li>
      </ul>

      <h2>Acceptable use</h2>
      <p>When using the Portal you agree to:</p>
      <ul>
        <li>Use it only for WMX business, such as responding to and coordinating with clients.</li>
        <li>Treat client information as confidential and access only what you need for your work.</li>
        <li>Communicate with clients professionally and in line with WMX policies and applicable law, including rules on text messaging and email.</li>
        <li>Not copy, export or share client information outside WMX except as your work requires.</li>
        <li>Not try to get around security controls, access other people&rsquo;s accounts, or disrupt the Portal.</li>
      </ul>

      <h2>Client information</h2>
      <p>
        Client conversations, contact details, recordings and files in the Portal belong to WMX and its clients. How they are
        handled is described in the{" "}
        <Link href="/privacy" className="underline underline-offset-2">
          Privacy Policy
        </Link>
        . Messages you send from the Portal are sent through WMX&rsquo;s GoHighLevel account and are recorded with your name.
      </p>

      <h2>Connected services</h2>
      <p>
        The Portal works with services such as GoHighLevel, Google, Slack, Supabase and Vercel. Your use of those services is also
        subject to their own terms.
      </p>

      <h2>Changes and availability</h2>
      <p>
        WMX may change, suspend or stop the Portal or any feature at any time. We aim to keep it available and accurate but do not
        guarantee it will always be uninterrupted or error-free. Always use your judgment, and check the original messages in
        GoHighLevel if something looks wrong.
      </p>

      <h2>Ending access</h2>
      <p>
        WMX may suspend or remove your access at any time, for example when your role changes or if these terms are not followed.
        Your confidentiality obligations continue after your access ends.
      </p>

      <h2>Disclaimer and limitation of liability</h2>
      <p>
        The Portal is provided &ldquo;as is&rdquo; for internal business use. To the extent permitted by law, WMX is not liable for
        indirect or consequential losses arising from use of the Portal. Nothing in these terms limits rights that cannot be
        limited by law or changes your employment or contractor agreement with WMX.
      </p>

      <h2>Changes to these terms</h2>
      <p>We may update these terms. The effective date above shows when they were last changed; continuing to use the Portal means you accept the update.</p>

      <h2>Contact</h2>
      <p>
        Questions about these terms: contact <ContactLine />.
      </p>
    </LegalPage>
  );
}
