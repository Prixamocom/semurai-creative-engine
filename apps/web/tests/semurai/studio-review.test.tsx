// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StudioReview } from '../../src/semurai/StudioReview';
import { StudioCommentThread } from '../../src/semurai/StudioCommentThread';
import { StudioMedia } from '../../src/semurai/StudioMedia';
import { readReviewTarget, reviewBrief, type StudioComment } from '../../src/semurai/studio-review';
afterEach(cleanup);
const target = { file: 'secondpage.html', version: 3, label: 'h1', selector: '#hero', text: 'Welcome', slideIndex: 1 };
describe('Studio review workflow', () => {
  it('preserves the precise file, slide and source version in AI instructions', () => {
    expect(reviewBrief(target, 'Make this smaller')).toContain('secondpage.html');
    expect(reviewBrief(target, 'Make this smaller')).toContain('version 3, slide 2');
    expect(reviewBrief(target, 'Make this smaller')).toContain('#hero');
    expect(readReviewTarget({ label: 'div', selector: '#x', position: { x: NaN, y: 0, width: 5, height: 5 } }, 'index.html', 2)?.position).toBeUndefined();
    expect(readReviewTarget({ selector: 123 }, 'index.html', 1)).toBeNull();
  });
  it('saves a scoped comment, sends it to the composer and resolves it without a generation request', async () => {
    const comment: StudioComment = { id: 'one', text: 'Make this smaller', target, resolved: false, revision: 1, author: 'Test', created_at: '2026-09-14T10:00:00Z' };
    const api = vi.fn().mockResolvedValueOnce({ data: [comment] }).mockResolvedValueOnce({ data: [{ ...comment, resolved: true, revision: 2 }] });
    const ask = vi.fn();
    function Review() { const [comments, setComments] = useState<StudioComment[]>([]); const [resolved, setResolved] = useState(false); return <StudioReview comments={comments} onCommentsChange={setComments} resolved={resolved} onResolvedChange={setResolved} activeCommentId={null} locale="en" file={target.file} version={3} target={target} disabled={false} api={api} onAsk={ask} onSelect={() => {}} onClose={() => {}} />; }
    render(<Review />);
    await screen.findByText('No comments for this file.');
    fireEvent.change(screen.getByRole('textbox'), { target: { value: comment.text } });
    fireEvent.click(screen.getByRole('button', { name: 'Save comment' }));
    await screen.findByText(comment.text);
    expect(api).toHaveBeenCalledWith('comments', 'POST', expect.objectContaining({ action: 'create', target, text: comment.text }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Add to AI chat' }).at(-1)!);
    expect(ask).toHaveBeenCalledWith(target, comment.text);
    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));
    await screen.findByText('No comments for this file.');
    expect(api).toHaveBeenLastCalledWith('comments', 'POST', { action: 'resolve', id: 'one', revision: 1 });
    fireEvent.click(screen.getByLabelText('Show resolved'));
    expect(screen.getByRole('button', { name: 'Reopen' })).toBeTruthy();
  });
  it('keeps a reply draft after a revision conflict and includes the discussion in AI context', async () => {
    const comment: StudioComment = { id: 'one', text: 'Make this smaller', target, resolved: false, revision: 1, author: 'Test', created_at: '2026-09-14T10:00:00Z' };
    const updated = { ...comment, revision: 2, replies: [{ id: 'other', text: 'Keep the cream background', author: 'Colleague', created_at: comment.created_at }] };
    const api = vi.fn().mockRejectedValueOnce(new Error('Conflict')).mockResolvedValueOnce({ data: [updated] }).mockResolvedValueOnce({ data: [{ ...updated, revision: 3, replies: [...updated.replies, { id: 'mine', text: 'Use 34px', author: 'Test', created_at: comment.created_at }] }] });
    const ask = vi.fn();
    function Thread() { const [item, setItem] = useState(comment); return <StudioCommentThread comment={item} locale="en" disabled={false} api={api} onChange={items => setItem(items[0]!)} onAsk={ask} />; }
    render(<Thread />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Reply' }), { target: { value: 'Use 34px' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reply' }));
    await screen.findByText('Keep the cream background');
    expect((screen.getByRole('textbox', { name: 'Reply' }) as HTMLTextAreaElement).value).toBe('Use 34px');
    fireEvent.click(screen.getByRole('button', { name: 'Reply' }));
    await screen.findByText('Use 34px');
    expect(api).toHaveBeenLastCalledWith('comments', 'POST', expect.objectContaining({ action: 'reply', revision: 2, text: 'Use 34px', reply_id: expect.any(String) }));
    expect(api.mock.calls[0]![2]!.reply_id).toBe(api.mock.calls[2]![2]!.reply_id);
    fireEvent.click(screen.getByRole('button', { name: 'Add to AI chat' }));
    expect(ask).toHaveBeenCalledWith('Make this smaller\n\nColleague: Keep the cream background\n\nTest: Use 34px');
  });
  it('keeps attachments behind the plus menu and restores keyboard focus on Escape', () => {
    render(<StudioMedia compact locale="en" images={[]} onChange={() => {}} useLibrary onLibrary={() => {}} disabled={false} onBusy={() => {}} api={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Attach images' })).toBeNull();
    const plus = screen.getByRole('button', { name: 'Attachments and media' });
    fireEvent.click(plus);
    expect(screen.getByRole('button', { name: 'Attach images' })).toBeTruthy();
    expect(screen.getByLabelText('Find matching photos in my library')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('button', { name: 'Attach images' })).toBeNull();
    expect(document.activeElement).toBe(plus);
  });
});
