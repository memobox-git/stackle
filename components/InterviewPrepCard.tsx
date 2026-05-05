"use client";

import { useState } from "react";
import { ChevronDown, Target, BookOpen, MessageCircle, Lightbulb, Star } from "lucide-react";
import { InterviewPrepPlan } from "@/lib/agents/schemas/interviewPrep";

function Section({
  title,
  icon: Icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon: typeof Target;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-gray-200">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-3 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
      >
        <span className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-gray-500" strokeWidth={1.75} />
          {title}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-600 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="pb-4">{children}</div>}
    </div>
  );
}

const PRIORITY_COLORS: Record<string, string> = {
  high: "bg-red-500/10 text-red-400 border-red-500/20",
  medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  low: "bg-green-500/10 text-green-400 border-green-500/20",
};

export default function InterviewPrepCard({ plan }: { plan: InterviewPrepPlan }) {
  return (
    <div className="w-full max-w-3xl mx-auto px-4 mb-4">
      <div className="bg-gray-100 border border-gray-200 rounded-xl px-5 py-4">
        {/* Header */}
        <div className="flex items-center gap-2 mb-1">
          <Target className="w-4 h-4 text-blue-400" strokeWidth={2} />
          <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">
            Interview Prep
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className="text-lg font-semibold text-gray-900">{plan.role}</span>
          <span className="text-xs px-2 py-0.5 rounded-full border border-gray-300 text-gray-500 capitalize">
            {plan.level}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full border border-blue-500/30 text-blue-400 capitalize">
            {plan.interviewType.replace(/_/g, " ")}
          </span>
        </div>

        {/* Topics to Study */}
        <Section title={`Topics to Study (${plan.topicsToStudy.length})`} icon={BookOpen} defaultOpen>
          <div className="space-y-2">
            {plan.topicsToStudy.map((t, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium mt-0.5 flex-shrink-0 ${PRIORITY_COLORS[t.priority] ?? PRIORITY_COLORS.medium}`}>
                  {t.priority}
                </span>
                <div>
                  <span className="text-sm text-gray-900 font-medium">{t.topic}</span>
                  <p className="text-xs text-gray-500 mt-0.5">{t.notes}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Practice Questions */}
        <Section title={`Practice Questions (${plan.practiceQuestions.length})`} icon={MessageCircle} defaultOpen>
          <div className="space-y-3">
            {plan.practiceQuestions.map((q, i) => (
              <QuestionItem key={i} index={i + 1} question={q} />
            ))}
          </div>
        </Section>

        {/* STAR Examples */}
        {plan.starExamples.length > 0 && (
          <Section title={`STAR Examples (${plan.starExamples.length})`} icon={Star}>
            <div className="space-y-3">
              {plan.starExamples.map((s, i) => (
                <div key={i} className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-gray-500 font-medium">Situation:</span>
                      <p className="text-gray-700 mt-0.5">{s.situation}</p>
                    </div>
                    <div>
                      <span className="text-gray-500 font-medium">Task:</span>
                      <p className="text-gray-700 mt-0.5">{s.task}</p>
                    </div>
                    <div>
                      <span className="text-gray-500 font-medium">Action:</span>
                      <p className="text-gray-700 mt-0.5">{s.action}</p>
                    </div>
                    <div>
                      <span className="text-gray-500 font-medium">Result:</span>
                      <p className="text-gray-700 mt-0.5">{s.result}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Tips */}
        {plan.tips.length > 0 && (
          <Section title={`Tips (${plan.tips.length})`} icon={Lightbulb}>
            <ul className="space-y-1.5">
              {plan.tips.map((tip, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-500">
                  <span className="text-gray-600 mt-0.5">→</span>
                  {tip}
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </div>
  );
}

function QuestionItem({
  index,
  question,
}: {
  index: number;
  question: { question: string; category: string; difficulty: string; modelAnswer: string };
}) {
  const [showAnswer, setShowAnswer] = useState(false);
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] text-gray-600 font-mono">Q{index}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded border border-gray-300 text-gray-500">{question.category}</span>
            <span className="text-[10px] text-gray-600 capitalize">{question.difficulty}</span>
          </div>
          <p className="text-sm text-gray-200">{question.question}</p>
        </div>
        <button
          onClick={() => setShowAnswer(!showAnswer)}
          className="text-[10px] text-blue-400 hover:text-blue-300 flex-shrink-0 mt-1"
        >
          {showAnswer ? "Hide" : "Show answer"}
        </button>
      </div>
      {showAnswer && (
        <p className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-200 leading-relaxed">
          {question.modelAnswer}
        </p>
      )}
    </div>
  );
}
