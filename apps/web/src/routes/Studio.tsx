export function Studio() {
  return (
    <div className="grid h-full grid-cols-[minmax(420px,44%)_1fr]">
      <section aria-label="Üretim" className="flex flex-col gap-4 border-r border-line p-6">
        <h1 className="text-[16px] font-medium">Stüdyo</h1>
        <div className="rounded-card bg-paper p-4 text-ink-2 shadow-subtle">
          Henüz üretim yok. Ürün adıyla üretim başlatma, canlı adımlar ve agent kartları M4'te bu panele gelecek.
        </div>
      </section>
      <section aria-label="Chat" className="flex flex-col p-6">
        <div className="rounded-card bg-paper p-4 text-ink-2 shadow-subtle">Chat paneli M3'te etkinleşecek.</div>
      </section>
    </div>
  );
}
