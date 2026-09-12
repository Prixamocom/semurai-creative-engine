// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StudioImagePicker } from '../../src/semurai/StudioImagePicker';
afterEach(cleanup);
const first = { id: '1', title: 'Product photo', description: 'A ceramic cup', dataUrl: 'data:image/png;base64,aA==' };
const second = { ...first, id: '2', title: 'Second photo' };
describe('Direct Studio image picker', () => {
  it('searches the owned library, selects exactly one image and applies edited alternative text', async () => {
    const api = vi.fn().mockResolvedValue({ data: [first, second], has_more: false });
    const apply = vi.fn().mockReturnValue(true);
    render(<StudioImagePicker target={null} locale="en" api={api} onApply={apply} onClose={() => {}} />);
    expect(screen.queryByLabelText('Find matching photos in my library')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Media library' }));
    await screen.findByRole('button', { name: /^Product photo/ });
    expect(api).toHaveBeenCalledWith('media/search', 'POST', { search: '', page: 1 });
    fireEvent.click(screen.getByRole('button', { name: /^Product photo/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Second photo/ }));
    fireEvent.change(screen.getByLabelText('Alternative text'), { target: { value: 'Kubek na stole' } });
    fireEvent.click(screen.getByRole('button', { name: 'Insert image' }));
    expect(apply).toHaveBeenCalledExactlyOnceWith(second, 'Kubek na stole', 'end');
  });
  it('uploads through the project media endpoint and reports a stale project without closing', async () => {
    const api = vi.fn().mockResolvedValue({ data: first }); const close = vi.fn();
    render(<StudioImagePicker target={null} locale="en" api={api} onApply={() => false} onClose={close} />);
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    expect(input.multiple).toBe(false);
    fireEvent.change(input, { target: { files: [new File(['image'], 'cup.png', { type: 'image/png' })] } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Insert image' }).hasAttribute('disabled')).toBe(false));
    expect(api).toHaveBeenCalledWith('media/upload', 'POST', { image_data: expect.stringMatching(/^data:image\/png;base64,/), title: 'cup.png' });
    fireEvent.click(screen.getByRole('button', { name: 'Insert image' }));
    expect(screen.getByRole('alert').textContent).toContain('project or selection changed');
    expect(close).not.toHaveBeenCalled();
  });
});
