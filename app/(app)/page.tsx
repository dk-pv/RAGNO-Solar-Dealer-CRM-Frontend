// The CRM entry point at "/": it renders inside the shared shell like every other CRM page.
// Once the Dashboard module exists, this page can redirect("/dashboard") instead.
export default function HomePage() {
  return (
    <section>
      <h1 className="text-xl font-semibold">Ragno Power System</h1>
      <p className="mt-1 text-sm text-muted-foreground">Choose a section from the menu to get started.</p>
    </section>
  );
}
