import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export function Input({
  label,
  error,
  helperText,
  className = '',
  ...props
}: InputProps) {
  const baseStyles = 'w-full px-3 py-2 border rounded-lg transition-colors duration-200';
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
      <input
        className={`${baseStyles} ${stateStyles} ${className} disabled:bg-gray-100 disabled:cursor-not-allowed`}
        {...props}
      />
      {error && (
        <p className="mt-1 text-sm text-red-600">{error}</p>
      )}
      {helperText && !error && (
        <p className="mt-1 text-sm text-gray-500">{helperText}</p>
      )}
    </div>
  );
}
