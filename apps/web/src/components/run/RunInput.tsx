import { Send } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '../ui/button.js';
import { Textarea } from '../ui/textarea.js';

interface RunInputProps {
  onSubmit: (input: string) => void;
  disabled?: boolean;
}

export function RunInput({ onSubmit, disabled }: RunInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const MAX = 10_000;

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, MAX))}
          onKeyDown={handleKeyDown}
          placeholder="Ask Foundry anything — e.g. 'Review PR #42' or 'Why did yesterday's deploy fail?'"
          disabled={disabled}
          rows={3}
          className="pr-12 text-sm"
        />
        <Button
          size="icon"
          onClick={handleSubmit}
          disabled={disabled || !value.trim()}
          className="absolute bottom-2 right-2 h-8 w-8"
        >
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex items-center justify-between px-1">
        <p className="text-xs text-gray-400">
          Press <kbd className="rounded bg-gray-100 px-1 py-0.5 font-mono text-xs">⌘ Enter</kbd> to submit
        </p>
        {value.length > MAX * 0.8 && (
          <p className="text-xs text-gray-400">
            {value.length} / {MAX}
          </p>
        )}
      </div>
    </div>
  );
}
