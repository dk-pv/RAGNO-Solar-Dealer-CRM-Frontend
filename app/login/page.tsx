import type { Metadata } from "next";
import { Suspense } from "react";

import { CalendarIcon, LeadsIcon, WorksIcon } from "@/components/layout/icons";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in | Ragno Power System" };

const HIGHLIGHTS = [
  { icon: LeadsIcon, title: "Lead pipeline", text: "Every enquiry from New to Won, at a glance." },
  { icon: WorksIcon, title: "Works", text: "Won leads become Works, tracked through to completion." },
  { icon: CalendarIcon, title: "Follow-ups", text: "The next call and site visit, never missed." },
];

// Outside the app/(app) group, so it renders without the sidebar and navbar.
export default function LoginPage() {
  return (
    <main className="grid grid-cols-1 flex-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      {/* Brand panel, large screens only. Decorative rings echo the sun; text stays on the darker part of the gradient. */}
      <section
        aria-label="Ragno Power System"
        className="relative hidden overflow-hidden bg-linear-to-br from-primary-active to-primary-hover p-10 text-white lg:flex lg:flex-col xl:p-14"
      >
        <span aria-hidden="true" className="absolute -top-40 -right-40 size-[28rem] rounded-full border border-white/10" />
        <span aria-hidden="true" className="absolute -top-24 -right-24 size-80 rounded-full border border-white/10" />
        <span aria-hidden="true" className="absolute -top-8 -right-8 size-48 rounded-full bg-white/5" />

        <div className="relative flex items-center gap-3">
          <span
            aria-hidden="true"
            className="grid size-10 place-items-center rounded-lg bg-white text-base font-bold text-primary-strong"
          >
            R
          </span>
          <div className="leading-tight">
            <p className="font-semibold">Ragno Power System</p>
            <p className="text-sm text-white/85">Solar Dealer CRM</p>
          </div>
        </div>

        <div className="relative my-auto max-w-md py-12">
          <p className="text-3xl leading-tight font-semibold tracking-tight xl:text-4xl">
            Every solar lead, from first call to installation.
          </p>
          <p className="mt-4 text-white/90">
            Track leads, convert the ones you win and keep every installation moving, all in one place.
          </p>
        </div>

        <ul className="relative grid gap-5">
          {HIGHLIGHTS.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-md bg-white/10 ring-1 ring-white/15">
                <Icon className="size-4.5" />
              </span>
              <span className="text-sm">
                <span className="block font-medium">{title}</span>
                <span className="text-white/85">{text}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex items-center justify-center bg-background px-4 py-12 sm:px-8">
        {/* LoginForm reads ?next= from the URL, which needs a Suspense boundary when prerendered. */}
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
