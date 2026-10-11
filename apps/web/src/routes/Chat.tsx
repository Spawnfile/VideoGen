import { ChatPanel } from '../components/chat/ChatPanel.tsx';
import { NO_VIDEO } from '../lib/production-view.ts';

/** Phone and tablet: the chat on its own page. "New chat" also clears the Studio's selected video, as it does beside the Studio. */
export function Chat() {
  return (
    <div className="flex h-full min-h-0 flex-col px-4 pt-2 md:mx-auto md:max-w-[760px] md:px-6 md:pt-6">
      <ChatPanel onNewThread={() => history.replaceState(history.state, '', `/chat?video=${NO_VIDEO}`)} />
    </div>
  );
}
