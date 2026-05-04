import React from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: SelectOption[];
}

export function Select({
  label,
  error,
  options,
  className = '',
  ...props
}: SelectProps) {
  const baseStyles = 'w-full px-3 py-2 border rounded-lg transition-colors duration-200 bg-white';
  const stateStyles = error
    ? 'border-red-500 focus:border-red-600 focus:ring-2 focus:ring-red-200'
    : 'border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200';
  
  return (
    <div className="w-full">
      {label && (
        <label className="block mb-1.5 text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <select
        className={`${baseStyles} ${stateStyles} ${className} disabled:bg-gray-100 disabled:cursor-not-allowed`}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && (
        <p className="mt-1 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}
