import { ChatPanel } from '../components/chat/ChatPanel.tsx';
import { clearStudioVideo } from '../lib/stores.ts';

/** Phone and tablet: the chat on its own page. "New chat" also clears the Studio's picked video, as it does beside the desktop Studio. */
export function Chat() {
  return (
    <div className="flex h-full min-h-0 flex-col px-4 pt-1 md:mx-auto md:max-w-[760px] md:px-6 md:pt-6">
      <ChatPanel onNewThread={clearStudioVideo} />
    </div>
  );
}
