import type { Metadata } from "next";
import { ContactLine, LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Privacy Policy · WMX Client Communications" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        WMX Client Communications (&ldquo;the Portal&rdquo;) is an internal tool operated by WMX Management Group
        (&ldquo;WMX&rdquo;, &ldquo;we&rdquo;) for Watermark Design Build and other WMX businesses. It helps our team keep track of
        messages and calls from clients and respond to them on time. This policy explains what information the Portal handles,
        why, and how it is protected.
      </p>

      <h2>Who can use the Portal</h2>
      <p>
        The Portal is only for authorized WMX staff and contractors. It is not offered to the public, and clients do not sign in
        to it.
      </p>

      <h2>Information we collect</h2>
      <p>
        <strong>About team members (people who sign in):</strong>
      </p>
      <ul>
        <li>Name and email address, from your Google account when you choose &ldquo;Continue with Google&rdquo;, or entered by an administrator.</li>
        <li>Role, department, phone number and Slack member ID, if an administrator adds them.</li>
        <li>Activity in the Portal, such as messages sent, notes written, assignments and escalations, with the time and who did it.</li>
        <li>Notification preferences.</li>
      </ul>
      <p>
        <strong>About clients (people who contact our businesses):</strong> the Portal copies client conversations from our
        GoHighLevel account so the team can see and answer them in one place. This can include a client&rsquo;s name, phone number,
        email address, project details, text messages, emails, chat messages, call details (time, length and outcome),
        voicemails and call recordings, and photos or files they send.
      </p>

      <h2>Google sign-in</h2>
      <p>
        If you sign in with Google, the Portal receives only your basic profile: your name, email address and whether Google has
        verified that address. We use it solely to sign you in and to match you to your team record. The Portal does not access
        your Gmail, Google Drive, contacts, calendar or any other Google data. Information received from Google is used in
        accordance with the{" "}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" className="underline underline-offset-2">
          Google API Services User Data Policy
        </a>
        , including its Limited Use requirements. We do not sell it, use it for advertising, or share it except as needed to run
        the Portal.
      </p>

      <h2>How we use information</h2>
      <ul>
        <li>To show the team which clients are waiting for a reply, how long they have waited, and who is responsible.</li>
        <li>To send and record replies to clients through GoHighLevel.</li>
        <li>To notify team members about escalations, reminders, mentions and new messages, in the Portal, by Slack and by email.</li>
        <li>To produce internal reports on response times and workload.</li>
        <li>To keep the Portal secure, for example checking new passwords against known data breaches.</li>
      </ul>
      <p>We do not sell personal information and we do not use it for advertising.</p>

      <h2>Services we use</h2>
      <p>The Portal relies on these providers to operate. Each processes information only as needed to provide its service:</p>
      <ul>
        <li><strong>Supabase</strong> — database, sign-in and file storage (hosted in the United States).</li>
        <li><strong>Vercel</strong> — hosting of the Portal website.</li>
        <li><strong>GoHighLevel</strong> — our customer messaging platform, where client conversations originate and replies are sent.</li>
        <li><strong>Google</strong> — sign-in, if you choose it.</li>
        <li><strong>Slack</strong> — direct-message notifications to team members, if set up.</li>
        <li>
          <strong>Have I Been Pwned</strong> — when a password is set, only the first five characters of a one-way scrambled
          version (hash) of it are sent to check whether it has appeared in a data breach. The password itself is never sent.
        </li>
      </ul>

      <h2>Cookies</h2>
      <p>
        The Portal uses only the cookies needed to keep you signed in and to remember which business you are viewing. It does
        not use advertising or tracking cookies. Your browser may also store small settings, such as whether notification
        sounds are on.
      </p>

      <h2>How information is protected</h2>
      <ul>
        <li>Access is limited to people on the team list; the database enforces this on every request.</li>
        <li>Information is encrypted in transit (HTTPS) and stored with our providers&rsquo; encryption at rest.</li>
        <li>Secret keys are kept on the server and never sent to browsers.</li>
        <li>Administrators can remove access at any time.</li>
      </ul>

      <h2>How long we keep information</h2>
      <p>
        Client conversations and related records are kept for as long as they are needed to serve the client and for our
        legitimate business and legal record-keeping purposes. Team member records are removed or deactivated when someone no
        longer needs access. Clients marked as spam or archived can be removed by an administrator.
      </p>

      <h2>Your choices and rights</h2>
      <p>
        Team members can update their notification preferences at any time and can ask an administrator to correct or remove
        their information. Clients who want to see, correct or delete information we hold about them can contact the WMX business
        they work with or contact us below. Depending on where you live, you may have additional rights under local law; we will
        respond to requests as the law requires.
      </p>

      <h2>Children</h2>
      <p>The Portal is not intended for children and is used only by WMX staff and contractors.</p>

      <h2>Changes to this policy</h2>
      <p>We may update this policy as the Portal changes. The effective date above shows when it was last updated.</p>

      <h2>Contact</h2>
      <p>
        Questions about this policy or your information: contact <ContactLine />.
      </p>
    </LegalPage>
  );
}
