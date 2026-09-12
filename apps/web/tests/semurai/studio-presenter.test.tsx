// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { StudioPresenter } from '../../src/semurai/StudioPresenter';

vi.mock('../../src/semurai/studio-preview', () => ({
  studioSlideCount: () => 3,
  studioPreviewSource: (_source: string, slide: number) => `<html><body>Slide ${slide + 1}</body></html>`,
}));
afterEach(() => { cleanup(); vi.useRealTimers(); });

it('navigates within bounds, shows matching notes and ignores unrelated frame messages', () => {
  const closed = vi.fn();
  render(<StudioPresenter source="deck" notes={['First note', 'Second note', '<script>Final note</script>']} initialSlide={0} locale="en" onClose={closed} />);
  expect(screen.getByRole('button', { name: 'Previous slide' }).hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Next slide' }));
  expect(screen.getByText('Second note')).toBeTruthy();
  const current = screen.getByTitle('Current slide') as HTMLIFrameElement;
  const next = document.querySelector<HTMLIFrameElement>('iframe[title="Next slide"]')!;
  act(() => window.dispatchEvent(new MessageEvent('message', { source: next.contentWindow, data: { type: 'od:slide-state', active: 2 } })));
  expect(screen.getByText('Second note')).toBeTruthy();
  act(() => window.dispatchEvent(new MessageEvent('message', { source: current.contentWindow, data: { type: 'od:slide-state', active: 99 } })));
  expect(screen.getByText('Second note')).toBeTruthy();
  act(() => window.dispatchEvent(new MessageEvent('message', { source: current.contentWindow, data: { type: 'od:slide-state', active: 2 } })));
  expect(screen.getByText('<script>Final note</script>')).toBeTruthy();
  expect(screen.getByText('Last slide')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Next slide' }).hasAttribute('disabled')).toBe(true);
  fireEvent.keyDown(window, { key: 'Home' }); expect(screen.getByText('First note')).toBeTruthy();
  fireEvent.keyDown(window, { key: 'End' });
  fireEvent.keyDown(window, { key: 'Escape' }); expect(closed).toHaveBeenCalledWith(2);
});

it('pauses, resumes and resets elapsed time without changing the selected slide', () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-13T00:00:00Z'));
  render(<StudioPresenter source="deck" notes={['First', 'Second', 'Third']} initialSlide={1} locale="en" onClose={() => {}} />);
  act(() => { vi.advanceTimersByTime(2000); }); expect(screen.getByLabelText('Presentation time').textContent).toBe('00:02');
  fireEvent.click(screen.getByRole('button', { name: 'Pause timer' }));
  act(() => { vi.advanceTimersByTime(5000); }); expect(screen.getByLabelText('Presentation time').textContent).toBe('00:02');
  fireEvent.click(screen.getByRole('button', { name: 'Start timer' }));
  act(() => { vi.advanceTimersByTime(1000); }); expect(screen.getByLabelText('Presentation time').textContent).toBe('00:03');
  fireEvent.click(screen.getByRole('button', { name: 'Reset timer' }));
  expect(screen.getByLabelText('Presentation time').textContent).toBe('00:00'); expect(screen.getByText('Second')).toBeTruthy();
});
