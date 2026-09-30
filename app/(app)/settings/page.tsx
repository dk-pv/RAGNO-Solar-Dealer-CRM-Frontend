import { redirect } from "next/navigation";

// Settings has one section so far.
export default function SettingsPage() {
  redirect("/settings/users");
}
