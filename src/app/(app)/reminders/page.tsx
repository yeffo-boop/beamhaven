import { redirect } from "next/navigation";

/** Reminders moved onto the Notifications page (Milestone 9, part 4, ADR-040). */
export default function RemindersPage() {
  redirect("/notifications");
}
