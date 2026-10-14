import "server-only";
import { serviceDb } from "./ghl-store";
import type { PlannedNotification } from "./notify-plan";
import { dispatchPending, saveNotifications } from "./notify-store";

/**
 * From a server action: record these notifications and try to send Slack/email
 * straight away. Never throws: the action itself already succeeded, and anything
 * not sent now goes out with the every-minute run.
 */
export async function notifyNow(planned: PlannedNotification[], about: Parameters<typeof saveNotifications>[2]): Promise<void> {
  if (!planned.length) return;
  try {
    const sb = serviceDb();
    await saveNotifications(sb, planned, about);
    await dispatchPending(sb, 10);
  } catch (err) {
    console.error("couldn't send notifications now; the scheduled run retries pending ones", err);
  }
}
