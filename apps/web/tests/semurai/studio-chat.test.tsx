// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { StudioChatTurn } from '../../src/semurai/StudioChatTurn';
import { studioEditorCopy } from '../../src/semurai/studio-editor-copy';
import { studioChatMessages, studioDisplayStatus, type StudioChatJob } from '../../src/semurai/studio-chat';
import { reviewBrief } from '../../src/semurai/studio-review';
afterEach(cleanup);

it('waits for Core storage before reporting a completed version', () => {
  expect(studioDisplayStatus({ ...job, status: 'generating' }, { runId: 'run', status: 'completed', messages: [] })).toBe('awaiting_storage');
  expect(studioDisplayStatus({ ...job, status: 'completed' }, { runId: 'run', status: 'generating', messages: [] })).toBe('completed');
});

it('keeps the fuller streamed message when polling returns an older snapshot', () => {
  expect(studioChatMessages({ ...job, assistant_messages: [{ id: '1', content: 'Reading', status: 'streaming' }] }, [{ id: '1', content: 'Reading the project.', status: 'streaming' }])[0]?.content).toBe('Reading the project.');
});

it('renders activities and the latest plan without showing raw execution details', () => {
  const view = render(<StudioChatTurn job={{ ...job, assistant_messages: [
    { id: 'p1', kind: 'activity', tool: 'plan', content: '', status: 'completed', todos: [{ content: 'Old plan', status: 'pending' }] },
    { id: 'r1', kind: 'activity', tool: 'read', content: 'index.html', status: 'completed' },
    { id: 'p2', kind: 'activity', tool: 'plan', content: '', status: 'completed', todos: [{ content: 'Update heading', status: 'in_progress' }] },
  ] }} busy={false} cancelling={false} copy={studioEditorCopy.en} onCancel={vi.fn()} onRetry={vi.fn()} />);
  expect(screen.queryByText('Old plan')).toBeNull();
  expect(screen.getByText('Update heading')).toBeTruthy();
  expect(screen.getByText('Read · index.html')).toBeTruthy();
  expect(view.container.querySelector('details')?.open).toBe(true);
});
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


it('keeps clarification terminal and the composer available without a cancel spinner', () => {
  const view = render(<StudioChatTurn job={{ ...job, status: 'awaiting_input', assistant_message: 'Which format?' }} busy={false} cancelling={false} copy={studioEditorCopy.en} onCancel={vi.fn()} onRetry={vi.fn()} />);
  expect(screen.getByRole('status').textContent).toBe(studioEditorCopy.en.needsInput);
  expect(screen.queryByRole('button', { name: studioEditorCopy.en.cancel })).toBeNull();
  expect(view.container.querySelector('.lucide-loader-circle')).toBeNull();
});

it('shows only what the user typed, with a chip for a selection', () => {
  const brief = reviewBrief({ file: 'deck.html', version: 3, label: 'h1', selector: 'section > h1', text: 'Welcome', slideIndex: 1 }, 'Make the heading shorter');
  const view = render(<StudioChatTurn job={{ ...job, brief }} busy={false} cancelling={false} copy={studioEditorCopy.pl} onCancel={vi.fn()} onRetry={vi.fn()} />);
  expect(screen.getByText('Make the heading shorter')).toBeTruthy();
  expect(screen.getByLabelText('Zaznaczony element').textContent).toBe('h1 · deck.html · Slajd 2');
  expect(view.container.textContent).not.toContain('User instruction');
  expect(view.container.textContent).not.toContain('selector');
  expect(view.container.textContent).not.toContain('Edit only');
});

it('shows a whole-file request without the engine prefix or a chip', () => {
  const view = render(<StudioChatTurn job={{ ...job, brief: 'Edit the file index.html within this project. Preserve other files.\nDodaj zdjęcie na początku' }} busy={false} cancelling={false} copy={studioEditorCopy.pl} onCancel={vi.fn()} onRetry={vi.fn()} />);
  expect(view.container.querySelector('p')?.textContent).toBe('Dodaj zdjęcie na początku');
  expect(screen.queryByLabelText('Zaznaczony element')).toBeNull();
});
