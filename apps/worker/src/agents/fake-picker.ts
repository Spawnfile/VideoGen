import type { FakeScript, SessionSpec } from '@videogen/claude';

/** Scenario choice in fake mode: an explicit script wins on turn 0; chat turns rotate through VG_FAKE_CHAT. */
export function fakePicker(chatFixtures = 'websearch,coding'): (spec: SessionSpec, turn: number) => FakeScript {
  const chat = chatFixtures.split(',').map((s) => s.trim()).filter(Boolean);
  return (spec, turn) => {
    if (turn === 0 && spec.fakeScript) return spec.fakeScript;
    if (spec.role === 'chat' && chat.length) return { fixture: chat[turn % chat.length]! };
    return { fixture: 'basic' };
  };
}
