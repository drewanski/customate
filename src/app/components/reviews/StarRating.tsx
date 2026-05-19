import React from 'react';
import { Star } from 'lucide-react';

/**
 * StarRating — small renderable rating widget. Interactive in `editable`
 * mode (controlled via `onChange`), display-only otherwise.
 */
export function StarRating({
  value,
  onChange,
  size = 18,
  editable = false,
}: {
  value: number;
  onChange?: (v: number) => void;
  size?: number;
  editable?: boolean;
}) {
  return (
    <div className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= Math.round(value);
        return (
          <button
            key={n}
            type="button"
            disabled={!editable}
            onClick={() => editable && onChange?.(n)}
            className={`${editable ? 'cursor-pointer hover:scale-110' : 'cursor-default'} transition-transform`}
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
          >
            <Star
              width={size}
              height={size}
              className={
                filled
                  ? 'fill-amber-400 stroke-amber-500'
                  : 'fill-transparent stroke-slate-300'
              }
            />
          </button>
        );
      })}
    </div>
  );
}
