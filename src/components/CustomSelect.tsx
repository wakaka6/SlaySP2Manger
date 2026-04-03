import React, { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";

export interface CustomSelectOption {
  value: string | number;
  label: string;
}

interface CustomSelectProps {
  value: string | number;
  options: CustomSelectOption[];
  onChange: (value: string | number) => void;
  className?: string;
}

export function CustomSelect({ value, options, onChange, className = "" }: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value) || options[0];

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className={`custom-select ${className}`} ref={containerRef}>
      <button
        type="button"
        className={`custom-select__trigger ${isOpen ? "is-open" : ""}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="custom-select__label">{selectedOption.label}</span>
        <ChevronDown size={14} className="custom-select__icon" />
      </button>

      {isOpen && (
        <div className="custom-select__menu">
          <div className="custom-select__menu-inner">
            {options.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`custom-select__option ${isSelected ? "is-selected" : ""}`}
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
