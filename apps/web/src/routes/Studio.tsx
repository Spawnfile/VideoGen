import { AgentPanel } from '../components/agents/AgentPanel.tsx';

export function Studio() {
  return (
    <div className="grid h-full grid-cols-[minmax(420px,44%)_1fr]">
      <section aria-label="Üretim" className="flex min-h-0 flex-col gap-5 overflow-y-auto border-r border-line p-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-[16px] font-medium">Stüdyo</h1>
          <p className="text-[13px] text-ink-2">Ürün adıyla üretim başlatma ve adım listesi M4'te bu panele gelecek.</p>
        </div>
        <AgentPanel />
      </section>
      <section aria-label="Chat" className="flex min-h-0 flex-col p-6">
        <div className="rounded-card bg-paper p-4 text-ink-2 shadow-subtle">Chat paneli bir sonraki adımda etkinleşecek.</div>
      </section>
    </div>
  );
}
