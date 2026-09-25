import { ImagePlus, Images, Paperclip } from 'lucide-react';
import { mediaCopy } from './StudioMedia';
import { studioImageCopy } from './StudioImagePicker';
import { StudioMenu, StudioMenuItem } from './StudioButton';

/** "Add image" icon menu of the Edit panel: attach a file or pick from the media library. */
export function StudioImageMenu({ locale, disabled, onSelect }: {
  locale: keyof typeof mediaCopy; disabled: boolean; onSelect: (source: 'attach' | 'library') => void;
}) {
  const label = studioImageCopy[locale].add;
  return <StudioMenu label={label} title={label} ariaLabel={label} icon align="end" disabled={disabled} trigger={<ImagePlus size={16} />}>
    <StudioMenuItem icon={<Paperclip size={16} />} onSelect={() => onSelect('attach')}>{mediaCopy[locale].attach}</StudioMenuItem>
    <StudioMenuItem icon={<Images size={16} />} onSelect={() => onSelect('library')}>{mediaCopy[locale].library}</StudioMenuItem>
  </StudioMenu>;
}
