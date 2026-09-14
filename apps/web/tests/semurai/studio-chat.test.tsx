// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { StudioChatTurn } from '../../src/semurai/StudioChatTurn';
import { studioEditorCopy } from '../../src/semurai/studio-editor-copy';
import { studioChatMessages, type StudioChatJob } from '../../src/semurai/studio-chat';
afterEach(cleanup);
const job: StudioChatJob = { id: 'job', brief: 'Change headline', status: 'generating', retryable: false, base_version: 1 };
const messages = [{ id: '1', content: 'Reading the page.', status: 'completed' as const }, { id: '2', content: 'Changing heading.', status: 'streaming' as const }];
it('retains separate progress messages when a final reply arrives and on reload', () => {
  const completed = { ...job, status: 'completed', assistant_messages: [...messages, { id: 'final', content: 'Done.', status: 'completed' as const }], assistant_message: 'Done.' };
  expect(studioChatMessages(completed)).toHaveLength(3);
  expect(studioChatMessages(job, messages)).toEqual(messages);
  render(<StudioChatTurn job={completed} busy={false} cancelling={false} copy={studioEditorCopy.en} onCancel={vi.fn()} onRetry={vi.fn()} />);
  expect(screen.getByText('Reading the page.')).toBeTruthy(); expect(screen.getByText('Done.')).toBeTruthy();
});
it('shows the cancel spinner immediately and while the server acknowledges cancellation', () => {
  const props = { job, busy: false, copy: studioEditorCopy.en, onCancel: vi.fn(), onRetry: vi.fn() };
  const view = render(<StudioChatTurn {...props} cancelling />);
  expect(screen.getByRole('button', { name: 'Cancelling…' }).getAttribute('aria-busy')).toBe('true');
  view.rerender(<StudioChatTurn {...props} job={{ ...job, cancel_requested: true }} cancelling={false} />);
  expect(screen.getByRole('button', { name: 'Cancelling…' }).hasAttribute('disabled')).toBe(true);
});
