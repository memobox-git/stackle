"use client";

import { FileText, Compass, MessageSquare, TrendingUp } from "lucide-react";

interface SuggestionChipsProps {
  onSelect: (text: string) => void;
  onUploadResume?: () => void;
}

const CHIPS = [
  { label: "Review my resume",     icon: FileText,     isUpload: true },
  { label: "Explore roles for me", icon: Compass,      prompt: "What roles suit my background in data and AI?" },
  { label: "Prep for interviews",  icon: MessageSquare, prompt: "Help me prep for a data or AI job interview." },
  { label: "What's hot in market", icon: TrendingUp,   prompt: "What skills and roles are most in demand in data and AI right now?" },
];

export default function SuggestionChips({ onSelect, onUploadResume }: SuggestionChipsProps) {
  return (
    <div className="flex flex-wrap gap-2.5 justify-center">
      {CHIPS.map((chip) => {
        const Icon = chip.icon;
        return (
          <button
            key={chip.label}
            onClick={() => {
              if (chip.isUpload && onUploadResume) {
                onUploadResume();
              } else if (chip.prompt) {
                onSelect(chip.prompt);
              }
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-full border border-gray-200 text-gray-500 text-sm bg-gray-50 hover:bg-white hover:border-gray-300 hover:text-gray-900 transition-all cursor-pointer"
          >
            <Icon className="w-3.5 h-3.5 flex-shrink-0 text-gray-700" strokeWidth={1.75} />
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
