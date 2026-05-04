import React from 'react';
import { Check } from 'lucide-react';

export interface Step {
  id: string;
  label: string;
  description?: string;
}

export interface StepperProps {
  steps: Step[];
  currentStep: number;
  className?: string;
}

export function Stepper({ steps, currentStep, className = '' }: StepperProps) {
  return (
    <div className={`flex items-center ${className}`}>
      {steps.map((step, index) => (
        <React.Fragment key={step.id}>
          <div className="flex flex-col items-center">
            <div
              className={`flex items-center justify-center w-10 h-10 rounded-full border-2 font-medium transition-colors ${
                index < currentStep
                  ? 'bg-green-600 border-green-600 text-white'
                  : index === currentStep
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-white border-gray-300 text-gray-400'
              }`}
            >
              {index < currentStep ? <Check className="w-5 h-5" /> : index + 1}
            </div>
            <p className={`mt-2 text-sm font-medium ${index <= currentStep ? 'text-gray-900' : 'text-gray-400'}`}>
              {step.label}
            </p>
            {step.description && (
              <p className="mt-0.5 text-xs text-gray-500 text-center max-w-[120px]">{step.description}</p>
            )}
          </div>
          {index < steps.length - 1 && (
            <div
              className={`flex-1 h-0.5 mx-4 ${index < currentStep ? 'bg-green-600' : 'bg-gray-300'}`}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
